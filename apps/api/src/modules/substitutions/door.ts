import { ErrorCode } from '@store/shared';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';

import { db } from '../../db/client.ts';
import { orderItems } from '../../db/schema/index.ts';
import { conflict, notFound, unprocessable } from '../../lib/errors.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import { emitOrderRefunded } from '../orders/events.ts';

// A replacement refused at the door, AFTER the money was taken: exactly that line is refunded
// through the same gateway call returns use. Three steps, because a network call must not run
// under row locks and must survive a crash anywhere:
//
//   1. INTENT   (transaction, order lock) check the line and write `refund_intent_at`: from here the
//               key `swap-refund:<line id>` always means this exact amount.
//   2. GATEWAY  (no transaction) look for a refund that already carries this line's id (Stripe forgets
//               an idempotency key after 24 h, the metadata never), else create it with the key.
//   3. MARK     (transaction) the line becomes `rejected` with `refunded_cents`, and the order's own
//               running `refunded_cents` grows by the same amount (analytics reads revenue net of it).
//
// Repeating the action at any point just continues; nothing refunds twice.

export interface DoorDeps {
  gateway: PaymentGateway;
  log: Logger;
  /** No payment gateway on this server (see ReturnsConfig.simulated): record a `sim_` refund. */
  simulated: boolean;
}

export interface DoorResult {
  orderNumber: string;
  itemId: string;
  refundedCents: number;
  alreadyRefunded: boolean;
}

// What the line was charged at capture: its weighed price if weighed, else unit x quantity.
const chargedCents = (i: checkoutRepo.OrderItemRow): number => i.finalCents ?? i.lineTotalCents;

export async function rejectAtDoor(
  deps: DoorDeps,
  orderNumber: string,
  itemId: string,
  actor: string,
): Promise<DoorResult> {
  const seen = await checkoutRepo.findOrderByNumber(orderNumber);
  if (!seen) throw notFound('Order not found');

  // 1. intent
  const planned = await db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, seen.id);
    if (!order) throw notFound('Order not found');
    const items = await checkoutRepo.listOrderItems(tx, order.id);
    const sub = items.find((i) => i.id === itemId && i.substitutesItemId !== null);
    if (!sub) throw notFound('Replacement not found');
    if (sub.swapStatus === 'rejected' && sub.refundIntentAt === null) {
      throw conflict(
        ErrorCode.CONFLICT,
        'This replacement was rejected before dispatch: nothing was charged',
      );
    }
    if (sub.swapStatus === 'rejected') {
      return { done: true as const, order, sub };
    }
    if (order.status === 'delivered') {
      throw conflict(
        ErrorCode.CONFLICT,
        'The order was delivered: the rider is gone, use a return instead',
      );
    }
    if (order.capturedCents === null) {
      throw conflict(
        ErrorCode.CONFLICT,
        'Nothing has been charged yet: reject the replacement instead of refunding it',
      );
    }
    if (sub.swapStatus !== 'accepted') {
      throw conflict(ErrorCode.CONFLICT, 'Only an accepted replacement can be refused at the door');
    }
    const cents = chargedCents(sub);
    if (!sub.refundIntentAt) {
      if (order.refundedCents + cents > order.capturedCents) {
        throw conflict(ErrorCode.CONFLICT, 'This refund would give back more than was charged');
      }
      await tx
        .update(orderItems)
        .set({ refundIntentAt: new Date() })
        .where(eq(orderItems.id, sub.id));
    }
    return { done: false as const, order, sub, cents };
  });
  if (planned.done) {
    return {
      orderNumber,
      itemId,
      refundedCents: planned.sub.refundedCents,
      alreadyRefunded: true,
    };
  }

  // 2. gateway
  const { order, sub, cents } = planned;
  if (cents > 0 && !deps.simulated) {
    const payment = await checkoutRepo.findPaymentByOrder(db, order.id);
    if (!payment?.providerPaymentIntentId) {
      throw conflict(ErrorCode.CONFLICT, 'This order has no payment to refund');
    }
    if (payment.status === 'authorized') {
      throw unprocessable('Capture the payment first: nothing has been charged yet');
    }
    const already = (await deps.gateway.listRefunds(payment.providerPaymentIntentId)).find(
      (r) =>
        r.metadata.order_item_id === sub.id && r.status !== 'failed' && r.status !== 'canceled',
    );
    if (!already) {
      await deps.gateway.refundPaymentIntent(
        payment.providerPaymentIntentId,
        `swap-refund:${sub.id}`,
        cents,
        { order_item_id: sub.id },
      );
    }
  }

  // 3. mark
  return db.transaction(async (tx) => {
    const locked = await checkoutRepo.lockOrder(tx, order.id);
    if (!locked) throw notFound('Order not found');
    const items = await checkoutRepo.listOrderItems(tx, order.id);
    const line = items.find((i) => i.id === sub.id);
    if (!line) throw notFound('Replacement not found');
    if (line.swapStatus === 'rejected') {
      return { orderNumber, itemId, refundedCents: line.refundedCents, alreadyRefunded: true };
    }
    await tx
      .update(orderItems)
      .set({ swapStatus: 'rejected', refundedCents: cents })
      .where(eq(orderItems.id, line.id));
    const original = items.find((i) => i.id === line.substitutesItemId);
    if (original) {
      await tx
        .update(orderItems)
        .set({ pickStatus: original.pickedQty === 0 ? 'missing' : 'short' })
        .where(eq(orderItems.id, original.id));
    }
    await checkoutRepo.updateOrder(tx, locked.id, {
      refundedCents: Math.min(locked.refundedCents + cents, locked.totalCents),
    });
    await checkoutRepo.insertHistory(tx, {
      orderId: locked.id,
      fromStatus: locked.status,
      toStatus: locked.status,
      actor,
      note: `Replacement ${line.productName} refused at the door: ${cents} refunded`,
    });
    // The money back is a refund like a return's: loyalty takes back the points that line earned, in
    // its share of the merchandise (`refundId` is the line, so a replayed mark writes nothing twice).
    await emitOrderRefunded(tx, {
      orderId: locked.id,
      refundId: line.id,
      amountCents: cents,
      full: false,
      lines: [{ orderItemId: line.id, quantity: line.quantity, refundCents: cents }],
      shippingCents: 0,
      donationCents: 0,
    });
    deps.log.info(
      { orderNumber, itemId, cents, simulated: deps.simulated },
      'swap refused at door',
    );
    return { orderNumber, itemId, refundedCents: cents, alreadyRefunded: false };
  });
}
