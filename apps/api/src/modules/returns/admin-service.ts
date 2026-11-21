import {
  ErrorCode,
  returnLineRefundCents,
  type AdminReturnDetail,
  type ReturnStatus,
} from '@store/shared';
import type { Logger } from 'pino';

import { db, type Tx } from '../../db/client.ts';
import { conflict, notFound, unprocessable } from '../../lib/errors.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import { emitOrderRefunded } from '../orders/events.ts';
import { applyTransition } from '../orders/transition.ts';
import { foodVariantIds, receiveStock } from '../stock/batches.ts';

import type { ReturnsConfig } from './config.ts';
import { queueReturnEmail } from './mail.ts';
import { refundedByReturns } from './refunded.ts';
import * as repo from './repo.ts';
import {
  InvalidReturnTransitionError,
  assertReturnTransition,
  nextReturnStatuses,
} from './state-machine.ts';
import { toReturnDto } from './view.ts';

export interface AdminReturnDeps {
  gateway: PaymentGateway;
  log: Logger;
  returns: ReturnsConfig;
}

const invalid = (err: InvalidReturnTransitionError) =>
  conflict(ErrorCode.CONFLICT, err.message, {
    from: err.from,
    to: err.to,
    allowed: nextReturnStatuses(err.from),
  });

// Locks the order, then the return (the repo-wide order: order -> payment -> inventory, and a
// return sits right under its order), and checks the requested move against the state machine on
// the LOCKED row, so two admins clicking at once cannot both win.
async function lockedFor(tx: Tx, returnId: string, orderId: string, to: ReturnStatus) {
  const order = await checkoutRepo.lockOrder(tx, orderId);
  const ret = await repo.lockReturn(tx, returnId);
  if (!order || !ret) throw notFound('Return not found');
  try {
    assertReturnTransition(ret.status, to);
  } catch (err) {
    if (err instanceof InvalidReturnTransitionError) throw invalid(err);
    throw err;
  }
  return { order, ret };
}

async function mustFind(returnId: string) {
  const seen = await repo.findReturn(db, returnId);
  if (!seen) throw notFound('Return not found');
  return seen;
}

export async function listReturns(query: {
  status?: ReturnStatus | undefined;
  page: number;
  limit: number;
}) {
  const { rows, total } = await repo.listAdmin(query);
  return {
    data: rows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      email: r.email,
      status: r.status,
      reason: r.reason,
      itemCount: Number(r.itemCount ?? 0),
      refundCents: r.refundCents,
      currency: r.currency,
      createdAt: r.createdAt.toISOString(),
    })),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getReturnDetail(
  returnId: string,
  cfg: ReturnsConfig,
): Promise<AdminReturnDetail> {
  const ret = await mustFind(returnId);
  const order = await checkoutRepo.findOrderById(db, ret.orderId);
  if (!order) throw notFound('Return not found');
  const items = await repo.listItems(db, [ret.id]);
  return {
    return: toReturnDto(ret, order.number, items),
    email: order.email,
    currency: order.currency,
    orderTotalCents: order.totalCents,
    shippingCents: order.shippingCents,
    shippingRefundable:
      order.shippingCents > 0 && !(await repo.shippingRefundedElsewhere(db, order.id, ret.id)),
    restockItemIds: items.filter((i) => i.reason !== 'damaged').map((i) => i.id),
    allowedNext: [...nextReturnStatuses(ret.status)],
    simulatedMode: cfg.simulated,
  };
}

export async function approve(deps: AdminReturnDeps, returnId: string, actor: string) {
  const seen = await mustFind(returnId);
  await db.transaction(async (tx) => {
    const { order, ret } = await lockedFor(tx, returnId, seen.orderId, 'approved');
    const row = await repo.updateReturn(tx, ret.id, { status: 'approved', approvedAt: new Date() });
    await queueReturnEmail(tx, 'return_approved', order, row, await repo.listItems(tx, [ret.id]));
  });
  deps.log.info({ returnId, actor }, 'return approved');
  return getReturnDetail(returnId, deps.returns);
}

export async function reject(
  deps: AdminReturnDeps,
  returnId: string,
  actor: string,
  reason: string,
) {
  const seen = await mustFind(returnId);
  await db.transaction(async (tx) => {
    const { order, ret } = await lockedFor(tx, returnId, seen.orderId, 'rejected');
    const row = await repo.updateReturn(tx, ret.id, { status: 'rejected', rejectReason: reason });
    await queueReturnEmail(tx, 'return_rejected', order, row, await repo.listItems(tx, [ret.id]));
  });
  deps.log.info({ returnId, actor }, 'return rejected');
  return getReturnDetail(returnId, deps.returns);
}

// The parcel is here: record it, and put the sellable lines back on the shelf. Stock comes from
// the ORDER's snapshot of each line (a kit puts back the parts it held at checkout, never what the
// kit is made of today), and every unit gets an `inventory_adjustments` row with reason `return`.
// Damaged lines are never restocked. Pickup orders (phase 23) will route this to the store's own
// stock; that phase adds the branch here.
export async function receive(
  deps: AdminReturnDeps,
  returnId: string,
  actor: string,
  restockItemIds: string[] | undefined,
) {
  const seen = await mustFind(returnId);
  await db.transaction(async (tx) => {
    const { order, ret } = await lockedFor(tx, returnId, seen.orderId, 'received');
    const items = await repo.listItems(tx, [ret.id]);
    const byId = new Map(items.map((i) => [i.id, i]));
    const chosen = restockItemIds ?? items.filter((i) => i.reason !== 'damaged').map((i) => i.id);
    for (const id of chosen) {
      const item = byId.get(id);
      if (!item) throw unprocessable('That line is not part of this return');
      if (item.reason === 'damaged') {
        throw unprocessable(
          `${item.productName} came back damaged and cannot go back on the shelf`,
        );
      }
    }
    const lines = checkoutRepo.expandOrderItems([...new Set(chosen)].map((id) => byId.get(id)!));
    // Returned units go back to the shelf of the store that packed the order.
    const storeId = checkoutRepo.storeOfOrder(order);
    await checkoutRepo.lockInventory(
      tx,
      storeId,
      lines.map((l) => l.variantId),
    );
    // Food that has left the cold chain cannot be sold again: it is refunded and written off
    // (a zero-delta adjustment keeps the trail); household goods go back on the shelf, undated.
    const food = await foodVariantIds(
      tx,
      lines.map((l) => l.variantId),
    );
    for (const line of lines) {
      const written = food.has(line.variantId);
      if (!written) await receiveStock(tx, storeId, line.variantId, line.quantity, null);
      await repo.insertAdjustment(tx, {
        storeId,
        variantId: line.variantId,
        delta: written ? 0 : line.quantity,
        reason: written ? 'written_off_return' : 'return',
        actor,
        note: `${written ? `${line.quantity} written off, ` : ''}Return ${ret.id} of order ${order.number}`,
      });
    }
    const row = await repo.updateReturn(tx, ret.id, { status: 'received', receivedAt: new Date() });
    await queueReturnEmail(tx, 'return_received', order, row, items);
  });
  deps.log.info({ returnId, actor }, 'return received');
  return getReturnDetail(returnId, deps.returns);
}

// Money back, in three steps that each survive a crash (the order the plan asks for):
//   1. INTENT, in a transaction: freeze the amount (lines, plus shipping if ticked) and stamp
//      `refund_intent_at`. From here the key `return-<id>` always means this exact refund.
//   2. GATEWAY, outside any transaction (a network call must not hold row locks): refund that
//      amount with the idempotency key, after checking the provider's own list for a refund that
//      already carries this return's id (keys expire after 24 h; the id never does). If we die after this, the money moved but the return still
//      says `received`.
//   3. MARK, in a transaction: status `refunded`, the provider's refund id, the event, the email,
//      and the order itself becomes `refunded` if every paid line is now fully back.
// Repeating the action at any point just continues: step 1 sees its own intent, step 2 gets the
// same answer from the provider, step 3 does nothing if it already ran. Nothing refunds twice.
export async function refund(
  deps: AdminReturnDeps,
  returnId: string,
  actor: string,
  opts: { refundShipping: boolean },
) {
  const seen = await mustFind(returnId);

  // 1. intent
  const planned = await db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, seen.orderId);
    const ret = await repo.lockReturn(tx, returnId);
    if (!order || !ret) throw notFound('Return not found');
    if (ret.status === 'refunded') return { done: true as const };
    try {
      assertReturnTransition(ret.status, 'refunded');
    } catch (err) {
      if (err instanceof InvalidReturnTransitionError) throw invalid(err);
      throw err;
    }
    if (ret.refundIntentAt) {
      // Continue whatever the order is by now: the money may already have moved, and the intent
      // is the one thing that must be finished (a webhook can have changed the order meanwhile).
      if (ret.refundShipping !== opts.refundShipping) {
        throw conflict(
          ErrorCode.CONFLICT,
          'A refund for this return is already in progress with different shipping settings; repeat it as it was',
        );
      }
      return { done: false as const, ret };
    }
    if (order.status !== 'delivered') {
      throw conflict(
        ErrorCode.CONFLICT,
        `The order is ${order.status}, so this return cannot be refunded`,
      );
    }
    // Price the lines NOW, from the units already refunded or in an intent (not from what was open
    // when the customer asked): a rejected return in between must not shift the rounding, or the
    // refunds of one line could add up to a cent more than was paid.
    const orderLines = new Map(
      (await checkoutRepo.listOrderItems(tx, order.id)).map((l) => [l.id, l]),
    );
    const before = await repo.intentQuantities(tx, order.id, ret.id);
    for (const item of await repo.listItems(tx, [ret.id])) {
      const line = orderLines.get(item.orderItemId);
      if (!line) continue;
      const cents = returnLineRefundCents(line, before.get(item.orderItemId) ?? 0, item.quantity);
      if (cents !== item.refundCents) await repo.setItemRefund(tx, item.id, cents);
    }
    const items = await repo.listItems(tx, [ret.id]);
    const lines = items.reduce((sum, i) => sum + i.refundCents, 0);
    let shipping = 0;
    if (opts.refundShipping) {
      if (await repo.shippingRefundedElsewhere(tx, order.id, ret.id)) {
        throw conflict(ErrorCode.CONFLICT, 'Shipping was already refunded with another return');
      }
      shipping = order.shippingCents;
    }
    const total = lines + shipping;
    // Returns hand back goods and shipping, never the round-up, so the ceiling is the total
    // WITHOUT the donation (the whole-order refund is the only door to it).
    const ceiling = order.totalCents - order.donationCents;
    if ((await refundedByReturns(tx, order.id)) + total > ceiling) {
      throw conflict(ErrorCode.CONFLICT, 'This refund would give back more than the customer paid');
    }
    const frozen = await repo.updateReturn(tx, ret.id, {
      refundCents: total,
      refundShipping: opts.refundShipping,
      refundIntentAt: new Date(),
    });
    return { done: false as const, ret: frozen };
  });
  if (planned.done) return getReturnDetail(returnId, deps.returns);

  // 2. gateway
  const { ret } = planned;
  let providerRefundId: string;
  let simulated = false;
  if (ret.refundCents === 0) {
    // Cheap lines can floor to nothing; there is no money to send, but the return still completes.
    providerRefundId = 'no_refund_due';
  } else if (deps.returns.simulated) {
    providerRefundId = `sim_return-${ret.id}`;
    simulated = true;
  } else {
    const payment = await checkoutRepo.findPaymentByOrder(db, ret.orderId);
    if (!payment?.providerPaymentIntentId) {
      throw conflict(ErrorCode.CONFLICT, 'This order has no payment to refund');
    }
    // Stripe forgets the idempotency key after 24 h, so a retry made days after a crash between
    // step 2 and step 3 could refund again. Our refund carries the return's id: look for it first.
    const already = (await deps.gateway.listRefunds(payment.providerPaymentIntentId)).find(
      (r) => r.metadata.return_id === ret.id && r.status !== 'failed' && r.status !== 'canceled',
    );
    if (already) {
      providerRefundId = already.id;
    } else {
      const info = await deps.gateway.refundPaymentIntent(
        payment.providerPaymentIntentId,
        `return-${ret.id}`,
        ret.refundCents,
        { return_id: ret.id },
      );
      providerRefundId = info.id;
    }
  }

  // 3. mark
  await db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, ret.orderId);
    const locked = await repo.lockReturn(tx, ret.id);
    if (!order || !locked) throw notFound('Return not found');
    if (locked.status === 'refunded') return; // a parallel click finished it first
    // The order's running total of money handed back (analytics reads revenue net of it), never
    // above what was paid.
    await checkoutRepo.updateOrder(tx, order.id, {
      refundedCents: Math.min(order.refundedCents + locked.refundCents, order.totalCents),
    });
    const row = await repo.updateReturn(tx, ret.id, {
      status: 'refunded',
      providerRefundId,
      simulated,
      refundedAt: new Date(),
    });
    const items = await repo.listItems(tx, ret.id === row.id ? [row.id] : []);

    // The order is refunded once every line we took money for is back in full. Free lines (gifts)
    // cannot be returned, so they do not hold the order open.
    const lines = await checkoutRepo.listOrderItems(tx, order.id);
    const back = await repo.refundedQuantities(tx, order.id);
    // If the order is already refunded (a whole-order refund got there first and emitted its own
    // full event for what was left), this return only reports its share: not full, no transition.
    const alreadyRefunded = order.status === 'refunded';
    const full =
      !alreadyRefunded &&
      lines
        .filter((l) => l.lineTotalCents - l.discountCents > 0)
        .every((l) => (back.get(l.id) ?? 0) >= l.quantity);
    if (full) {
      await applyTransition(tx, order, 'refunded', {
        actor,
        note: `All items returned and refunded (return ${row.id})`,
        skipRefundEvent: true,
      });
    }

    // ONE event per refund, carrying what came back, for subscribers such as loyalty clawback.
    await emitOrderRefunded(tx, {
      orderId: order.id,
      refundId: row.id,
      amountCents: row.refundCents,
      full,
      lines: items.map((i) => ({
        orderItemId: i.orderItemId,
        quantity: i.quantity,
        refundCents: i.refundCents,
      })),
      shippingCents: row.refundShipping ? order.shippingCents : 0,
      // A return refunds goods (and maybe shipping), never the round-up: that stays donated.
      donationCents: 0,
    });
    await queueReturnEmail(tx, 'return_refunded', order, row, items);
  });
  deps.log.info({ returnId, actor, simulated }, 'return refunded');
  return getReturnDetail(returnId, deps.returns);
}
