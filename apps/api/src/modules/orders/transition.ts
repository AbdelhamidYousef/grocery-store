import type { OrderStatus } from '@store/shared';

import type { Tx } from '../../db/client.ts';
import * as cartRepo from '../cart/repo.ts';
import * as repo from '../checkout/repo.ts';
import { enqueueEmail } from '../mail/outbox.ts';
import { refundedByReturns } from '../returns/refunded.ts';

import { emitOrderCancelled, emitOrderPaid, emitOrderRefunded } from './events.ts';
import { assertTransition, stockEffect } from './state-machine.ts';

export interface TransitionContext {
  /** 'system:webhook', 'system:reconciler', 'customer', 'admin:<email>'. */
  actor: string;
  note?: string | null;
  /** The change reports something the payment provider already did (see PROVIDER_ONLY_TRANSITIONS). */
  fromProvider?: boolean;
  /**
   * The caller emits `OrderRefunded` itself with the real amount and lines (a refunded return),
   * so this function must not emit its own whole-order event on top of it.
   */
  skipRefundEvent?: boolean;
}

// THE function that changes an order's status. Webhook, reconciler, checkout rollback and admin all
// end up here, so the rules (allowed move, stock effect, payment row, history) cannot drift apart
// between code paths. It runs inside the caller's transaction and requires the caller to hold the
// order's row lock (`repo.lockOrder`) and to pass the row that lock returned: the validation is
// only meaningful against a status nobody else can change meanwhile.
//
// Lock order is order (held by the caller) -> payment -> inventory, everywhere.
//
// Deliberately NOT here: talking to Stripe. A refund or intent cancel is a network call and must
// not run under row locks; the service layer does it before opening the transaction.
export async function applyTransition(
  tx: Tx,
  order: repo.OrderRow,
  to: OrderStatus,
  ctx: TransitionContext,
): Promise<repo.OrderRow> {
  const from = order.status;
  assertTransition(from, to, { fromProvider: ctx.fromProvider === true });

  const found = await repo.findPaymentByOrder(tx, order.id);
  const payment = found ? await repo.lockPayment(tx, found.id) : undefined;

  const effect = stockEffect(from, to);
  if (effect !== 'none') {
    const items = repo.expandOrderItems(await repo.listOrderItems(tx, order.id));
    await repo.lockInventory(
      tx,
      items.map((i) => i.variantId),
    );
    for (const { variantId, quantity } of items) {
      if (effect === 'commit') await repo.commitStock(tx, variantId, quantity);
      else if (effect === 'release') await repo.releaseStock(tx, variantId, quantity);
      else await repo.restockUnits(tx, variantId, quantity);
    }
  }

  if (payment) {
    if (to === 'paid') {
      await repo.updatePayment(tx, payment.id, { status: 'succeeded', lastError: null });
    } else if (to === 'refunded' || (to === 'cancelled' && from !== 'pending_payment')) {
      await repo.updatePayment(tx, payment.id, { status: 'refunded' });
    } else if (to === 'cancelled' && payment.status !== 'succeeded') {
      // `payment_status` has no "cancelled" value; `failed` with the reason is the honest fit.
      await repo.updatePayment(tx, payment.id, {
        status: 'failed',
        lastError: ctx.note ?? 'Order cancelled',
      });
    }
  }

  const updated = await repo.updateOrder(tx, order.id, {
    status: to,
    ...(to === 'paid' && { placedAt: new Date() }),
    // A whole-order refund hands everything back (a refund that closes out returns already moved
    // its own share, see returns/admin-service.ts, and passes skipRefundEvent).
    ...(to === 'refunded' && !ctx.skipRefundEvent && { refundedCents: order.totalCents }),
  });

  // Only a confirmed payment spends the cart; until then an abandoned checkout keeps it.
  if (to === 'paid' && order.cartId) await cartRepo.markStatus(order.cartId, 'converted', tx);

  await repo.insertHistory(tx, {
    orderId: order.id,
    fromStatus: from,
    toStatus: to,
    actor: ctx.actor,
    note: ctx.note ?? null,
  });

  // Customer emails are queued in THIS transaction (the outbox pattern, see mail/outbox.ts): the
  // email is owed exactly when the status change commits. Only the two moments a customer cares
  // about have one; the others (processing, delivered, cancelled, refunded) are visible in the
  // account page and Stripe already emails refund receipts.
  const kind = to === 'paid' ? 'order_confirmation' : to === 'shipped' ? 'order_shipped' : null;
  if (kind) await enqueueEmail(tx, { kind, orderId: order.id, to: order.email });

  // Tell the subscribers (trial samples now; points, referrals and store stock in later phases).
  // Inside this transaction, so a side effect and the status change commit together.
  if (to === 'paid') await emitOrderPaid(tx, { orderId: order.id });
  else if (to === 'cancelled') await emitOrderCancelled(tx, { orderId: order.id });
  else if (to === 'refunded' && !ctx.skipRefundEvent) {
    // A whole-order refund returns what is LEFT: earlier partial refunds (returns) already moved
    // their share, and the gateway's full refund covers only the rest. Returns never hand back
    // the round-up donation, so the rest always contains it.
    const left = Math.max(0, order.totalCents - (await refundedByReturns(tx, order.id)));
    await emitOrderRefunded(tx, {
      orderId: order.id,
      refundId: null,
      amountCents: left,
      full: true,
      lines: [],
      shippingCents: 0,
      donationCents: Math.min(order.donationCents, left),
    });
  }
  return updated;
}
