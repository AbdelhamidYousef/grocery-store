import { ErrorCode, riderProgress } from '@store/shared';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Logger } from 'pino';

import { db } from '../../db/client.ts';
import { inventoryAdjustments, orders } from '../../db/schema/index.ts';
import { conflict, notFound, unprocessable } from '../../lib/errors.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import { finalizeOrder, type Weighing } from '../checkout/capture.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import { applyTransition } from '../orders/transition.ts';
import { acceptUnanswered } from '../substitutions/swaps.ts';

import { isLineResolved } from './pick-list.ts';
import { riderFor } from './riders.ts';

// The back of the shop, three moments:
//
//   packOrder      "Bag packed": every line resolved (picked, weighed, short or missing), the units the
//                  packer did not find are written off in `inventory_adjustments`, `packed_at` is set and
//                  the order goes paid -> processing. It waits for swap answers until dispatch.
//   dispatchOrder  "Hand to rider": unanswered swaps count as accepted, the weights are frozen and the
//                  money captured ONCE (`finalizeOrder`, key `capture:<order>`; the network call is made
//                  with no row lock held), then ONE transaction records the rider, `dispatched_at`,
//                  status `shipped` and queues the email. Repeating it changes nothing.
//   deliverSimulated  (job) shipped orders whose simulated ride is over become `delivered`.

export interface PackResult {
  orderNumber: string;
  packedAt: string;
  alreadyPacked: boolean;
}

export async function packOrder(orderNumber: string, actor: string): Promise<PackResult> {
  const seen = await checkoutRepo.findOrderByNumber(orderNumber);
  if (!seen) throw notFound('Order not found');
  return db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, seen.id);
    if (!order) throw notFound('Order not found');
    // The same answer twice is the same request (a double click).
    if (order.packedAt) {
      return { orderNumber, packedAt: order.packedAt.toISOString(), alreadyPacked: true };
    }
    if (!['paid', 'processing'].includes(order.status) || order.dispatchedAt !== null) {
      throw conflict(ErrorCode.CONFLICT, 'Only a paid order that has not left can be packed');
    }
    if (order.capturedCents !== null) {
      throw conflict(ErrorCode.CONFLICT, 'This order is already charged');
    }
    const items = await checkoutRepo.listOrderItems(tx, order.id);
    const open = items.filter(
      (i) =>
        !isLineResolved({
          pickStatus: i.pickStatus,
          pickedQty: i.pickedQty,
          weighed: i.pricePerKgCents !== null,
          packedGrams: i.packedGrams,
          swapStatus: i.swapStatus,
        }),
    );
    if (open.length > 0) {
      throw unprocessable(
        `${open.length} ${open.length === 1 ? 'line is' : 'lines are'} not done yet: ${open
          .slice(0, 3)
          .map((i) => i.productName)
          .join(', ')}${open.length > 3 ? ' and more' : ''}`,
        { openItemIds: open.map((i) => i.id) },
      );
    }

    // The units the packer did not find. They left the books when the order was paid (G7 trims the
    // batch records, nothing is restocked), so the shelf already says what the walk found: the row
    // records the loss with a zero change, at THIS order's store, and the batch invariant is untouched.
    const storeId = checkoutRepo.storeOfOrder(order);
    const rows = items.flatMap((i) => {
      if (i.substitutesItemId !== null || !i.variantId || i.pickedQty === null) return [];
      const missing = i.quantity - i.pickedQty;
      if (missing <= 0) return [];
      return [
        {
          variantId: i.variantId,
          storeId,
          delta: 0,
          reason: 'not_found_at_pick',
          actor,
          note: `${missing} of ${i.quantity} x ${i.productName} not found packing ${order.number}; already off the books since payment`,
        },
      ];
    });
    if (rows.length > 0) await tx.insert(inventoryAdjustments).values(rows);

    if (order.status === 'paid') {
      await applyTransition(tx, order, 'processing', { actor, note: 'Bag packed' });
    } else {
      await checkoutRepo.insertHistory(tx, {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: order.status,
        actor,
        note: 'Bag packed',
      });
    }
    const packedAt = new Date();
    await checkoutRepo.updateOrder(tx, order.id, { packedAt });
    return { orderNumber, packedAt: packedAt.toISOString(), alreadyPacked: false };
  });
}

export interface DispatchDeps {
  gateway: PaymentGateway;
  log: Logger;
}

export interface DispatchResult {
  orderNumber: string;
  riderName: string;
  dispatchedAt: string;
  capturedCents: number | null;
  alreadyDispatched: boolean;
}

export async function dispatchOrder(
  deps: DispatchDeps,
  orderNumber: string,
  actor: string,
  now: Date = new Date(),
): Promise<DispatchResult> {
  const seen = await checkoutRepo.findOrderByNumber(orderNumber);
  if (!seen) throw notFound('Order not found');
  const done = (o: checkoutRepo.OrderRow, already: boolean): DispatchResult => ({
    orderNumber,
    riderName: o.riderName ?? '',
    dispatchedAt: (o.dispatchedAt ?? now).toISOString(),
    capturedCents: o.capturedCents,
    alreadyDispatched: already,
  });
  if (seen.dispatchedAt) return done(seen, true);
  if (!seen.packedAt || seen.status !== 'processing') {
    throw conflict(ErrorCode.CONFLICT, 'Pack the bag before handing it to the rider');
  }

  // 1. Settle the swaps and take the money, once. The grams the packer typed are frozen by
  //    `finalizeOrder` (a line weighed before keeps its weight); it calls `acceptUnanswered` itself, in
  //    the transaction that freezes the weights, and makes its network call with no lock held.
  const payment = await checkoutRepo.findPaymentByOrder(db, seen.id);
  if (payment?.captureMethod === 'manual') {
    const items = await checkoutRepo.listOrderItems(db, seen.id);
    const weights: Weighing[] = items.flatMap((i) =>
      i.pricePerKgCents !== null &&
      i.swapStatus !== 'rejected' &&
      i.pickStatus !== 'missing' &&
      i.packedGrams !== null
        ? [{ orderItemId: i.id, grams: i.packedGrams }]
        : [],
    );
    await finalizeOrder(deps, seen.id, {
      actor,
      weights,
      note: 'Captured when the bag was handed over',
    });
  } else {
    // Charged in full at checkout (an order from before manual capture): nothing to capture.
    await db.transaction(async (tx) => {
      if (await checkoutRepo.lockOrder(tx, seen.id)) await acceptUnanswered(tx, seen.id);
    });
  }

  // 2. One transaction: rider, time, status, email.
  return db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, seen.id);
    if (!order) throw notFound('Order not found');
    if (order.dispatchedAt) return done(order, true);
    if (order.status !== 'processing') {
      throw conflict(ErrorCode.CONFLICT, 'Pack the bag before handing it to the rider');
    }
    const rider = riderFor(order.id);
    await applyTransition(tx, order, 'shipped', {
      actor,
      note: `Handed to ${rider}`,
    });
    const updated = await checkoutRepo.updateOrder(tx, order.id, {
      dispatchedAt: now,
      riderName: rider,
    });
    return done(updated, false);
  });
}

export interface DeliveredResult {
  examined: number;
  delivered: number;
}

/**
 * The job: a shipped order whose simulated arrival has passed (`riderProgress`) becomes delivered and
 * the customer is told. Idempotent: each order is re-checked under its lock, so two overlapping runs
 * (or an admin who delivered it first) deliver it once.
 */
export async function deliverSimulated(
  now: Date = new Date(),
  log?: Logger,
): Promise<DeliveredResult> {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.status, 'shipped'), isNotNull(orders.dispatchedAt), isNull(orders.deliveredAt)),
    )
    .orderBy(asc(orders.dispatchedAt))
    .limit(200);
  const result: DeliveredResult = { examined: rows.length, delivered: 0 };
  for (const row of rows) {
    if (!row.dispatchedAt || !arrived(row, now)) continue;
    try {
      const did = await db.transaction(async (tx) => {
        const order = await checkoutRepo.lockOrder(tx, row.id);
        if (!order || order.status !== 'shipped' || order.deliveredAt || !order.dispatchedAt) {
          return false;
        }
        await applyTransition(tx, order, 'delivered', {
          actor: 'system:deliver-simulated',
          note: 'The simulated ride is over',
        });
        await checkoutRepo.updateOrder(tx, order.id, { deliveredAt: now });
        return true;
      });
      if (did) result.delivered += 1;
    } catch (err) {
      log?.error({ err, orderNumber: row.number }, 'deliver-simulated failed for an order');
    }
  }
  return result;
}

const arrived = (o: checkoutRepo.OrderRow, now: Date): boolean => {
  if (!o.dispatchedAt) return false;
  // An order from before slots has no window: its ride ends at the longest ride.
  const end = o.deliveryTo ?? new Date(o.dispatchedAt.getTime() + 30 * 60_000);
  return riderProgress(o.dispatchedAt, end, now).arrived;
};
