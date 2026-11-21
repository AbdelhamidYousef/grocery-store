import { cappedSwapCents, ErrorCode, lineShareCents, weighedCents } from '@store/shared';
import { and, asc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Logger } from 'pino';

import { db } from '../../db/client.ts';
import { orders, payments } from '../../db/schema/index.ts';
import { conflict, notFound, paymentProvider, unprocessable } from '../../lib/errors.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import { enqueueEmail } from '../mail/outbox.ts';
import { acceptUnanswered } from '../substitutions/swaps.ts';

import * as repo from './repo.ts';

// Manual capture (G6). At checkout the card is only AUTHORISED (for the order total plus a buffer on
// weighed lines); after packing the real amount is CAPTURED, which may be lower than the hold, never
// higher. Two functions, in this order of trust:
//
//   capturePayment   the primitive. One amount, validated against the authorised amount BEFORE
//                    Stripe is called (422), captured with the idempotency key `capture:<order id>`
//                    (a retry takes nothing twice), recorded once on the order.
//   finalizeOrder    works out the amount from the order (weighed lines at their real price, all
//                    other lines as priced) and calls capturePayment. Dispatch (G8, picking/dispatch.ts) calls it
//                    with the packed grams; the admin's "Capture now" and the `capture-overdue` job
//                    stay as the safety net.

export interface CaptureDeps {
  gateway: PaymentGateway;
  log: Logger;
}

export interface CaptureResult {
  orderNumber: string;
  authorizedCents: number;
  capturedCents: number;
  /** True when the order had been captured already and nothing was sent to Stripe. */
  alreadyCaptured: boolean;
}

// Statuses an authorised order can be captured in: from paid until it is with the customer.
const CAPTURABLE: readonly string[] = ['paid', 'processing', 'shipped', 'delivered'];

export async function capturePayment(
  deps: CaptureDeps,
  orderId: string,
  amountCents: number,
  actor: string,
  note?: string,
): Promise<CaptureResult> {
  const order = await repo.findOrderById(db, orderId);
  if (!order) throw notFound('Order not found');
  const payment = await repo.findPaymentByOrder(db, order.id);
  if (order.capturedCents !== null) {
    // Recorded once: asking again answers with what was recorded, Stripe is not called.
    return {
      orderNumber: order.number,
      authorizedCents: order.authorizedCents ?? order.totalCents,
      capturedCents: order.capturedCents,
      alreadyCaptured: true,
    };
  }
  if (!payment || payment.captureMethod !== 'manual' || !payment.providerPaymentIntentId) {
    throw conflict(
      ErrorCode.CONFLICT,
      'This order was charged in full at checkout; there is nothing to capture',
    );
  }
  if (payment.status !== 'authorized' || !CAPTURABLE.includes(order.status)) {
    throw conflict(
      ErrorCode.CONFLICT,
      'Only an authorised payment of a paid order can be captured',
    );
  }
  const authorized = order.authorizedCents ?? order.totalCents;
  // Refused here, before any call: capturing more than the hold is not something to try at Stripe.
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw unprocessable('The amount to capture must be a positive number of cents');
  }
  if (amountCents > authorized) {
    throw unprocessable(`Cannot capture ${amountCents}: only ${authorized} is authorised`, {
      authorizedCents: authorized,
      amountCents,
    });
  }

  // Outside any transaction (a network call must not hold row locks). The key is made from the
  // order alone: one capture per order, whatever happens to the request.
  const intent = await deps.gateway.capturePaymentIntent(
    payment.providerPaymentIntentId,
    amountCents,
    `capture:${order.id}`,
  );
  if (intent.status !== 'succeeded') {
    throw paymentProvider(`The capture did not complete (the payment is ${intent.status})`);
  }
  const captured = intent.amountReceivedCents || amountCents;

  return db.transaction(async (tx) => {
    const locked = await repo.lockOrder(tx, order.id);
    const lockedPayment = await repo.lockPayment(tx, payment.id);
    if (!locked || !lockedPayment) throw notFound('Order not found');
    if (locked.capturedCents !== null) {
      // A parallel call (or the webhook) recorded it first: same money, nothing more to do.
      return {
        orderNumber: locked.number,
        authorizedCents: authorized,
        capturedCents: locked.capturedCents,
        alreadyCaptured: true,
      };
    }
    await repo.updateOrder(tx, locked.id, { capturedCents: captured });
    await repo.updatePayment(tx, lockedPayment.id, { status: 'succeeded', lastError: null });
    await repo.insertHistory(tx, {
      orderId: locked.id,
      fromStatus: locked.status,
      toStatus: locked.status,
      actor,
      note: note ?? `Captured ${captured} of ${authorized} authorised`,
    });
    // "Your final bill": queued with the capture, so the mail is owed exactly when the money moved.
    await enqueueEmail(tx, { kind: 'order_final_bill', orderId: locked.id, to: locked.email });
    return {
      orderNumber: locked.number,
      authorizedCents: authorized,
      capturedCents: captured,
      alreadyCaptured: false,
    };
  });
}

export interface Weighing {
  orderItemId: string;
  grams: number;
}

type FinalLine = Pick<repo.OrderItemRow, 'lineTotalCents' | 'finalCents'> &
  Partial<
    Pick<
      repo.OrderItemRow,
      | 'quantity'
      | 'discountCents'
      | 'pickedQty'
      | 'substitutesItemId'
      | 'swapStatus'
      | 'depositCents'
    >
  >;

/**
 * The final amount of an order, from its lines. The order total (every line as priced, discounts
 * and shipping included) is corrected line by line by what was really packed and charged:
 *
 *   - a weighed line costs its real weight (`final_cents`) instead of its estimate;
 *   - a line the packer found only some units of (`picked_qty`) costs those units: its price and its
 *     share of the order discount scale with them, round half up; none found costs nothing;
 *   - the bottle deposit of a unit that was not found is not charged (the bottle never left the shop);
 *     delivery, bags and every other fee of the bill stay: they are part of `order.totalCents`;
 *   - a replacement line (it replaces another, was never in the total) is added at its price while
 *     the shopper has not rejected it: accepted, or unanswered, which dispatch settles as accepted.
 *     Its price is already min(its unit, the original's unit); a rejected one is not charged.
 *
 * The result is capped at the authorised amount (a bag that weighs more than the 15 % buffer is
 * charged the hold, we absorb the rest) and never below zero.
 */
export function finalAmountCents(
  order: Pick<repo.OrderRow, 'totalCents' | 'authorizedCents'>,
  items: FinalLine[],
): { amountCents: number; capped: boolean } {
  let delta = 0;
  for (const i of items) {
    if (i.substitutesItemId) {
      if (i.swapStatus !== 'rejected') delta += i.finalCents ?? i.lineTotalCents;
      continue;
    }
    const quantity = i.quantity ?? 0;
    const discount = i.discountCents ?? 0;
    const picked = i.pickedQty ?? null;
    const short = picked !== null && quantity > 0 && picked < quantity;
    const gross =
      picked === 0
        ? 0
        : (i.finalCents ??
          (short ? lineShareCents(i.lineTotalCents, picked, quantity) : i.lineTotalCents));
    const taken = short ? lineShareCents(discount, picked, quantity) : discount;
    delta += gross - taken - (i.lineTotalCents - discount);
    // The deposit rides on units, not on the goods: only the units that were found keep it.
    if (picked !== null && quantity > 0 && picked < quantity) {
      delta -= (i.depositCents ?? 0) * (quantity - picked);
    }
  }
  const raw = Math.max(order.totalCents + delta, 0);
  const authorized = order.authorizedCents ?? order.totalCents;
  return { amountCents: Math.min(raw, authorized), capped: raw > authorized };
}

export async function finalizeOrder(
  deps: CaptureDeps,
  orderId: string,
  opts: { actor: string; weights?: Weighing[]; note?: string },
): Promise<CaptureResult> {
  // 1. In one transaction: freeze the weighed lines (grams and the price they make) and work out the
  //    amount. A line that was weighed before keeps its weight: a retry cannot change what the
  //    first attempt decided, which is what lets the capture key stay one per order.
  const plan = await db.transaction(async (tx) => {
    const order = await repo.lockOrder(tx, orderId);
    if (!order) throw notFound('Order not found');
    if (order.capturedCents !== null) return { order, alreadyCaptured: true as const };
    // A swap nobody answered counts as accepted from here on: this is the moment the bag is closed.
    await acceptUnanswered(tx, order.id);
    const items = await repo.listOrderItems(tx, order.id);
    for (const w of opts.weights ?? []) {
      const item = items.find((i) => i.id === w.orderItemId);
      if (!item) throw unprocessable('That line is not part of this order');
      if (item.pricePerKgCents === null)
        throw unprocessable(`${item.productName} is not sold by weight`);
      if (!Number.isInteger(w.grams) || w.grams <= 0) {
        throw unprocessable('A weight must be a positive number of grams');
      }
      if (item.weighedGrams !== null) continue;
      let finalCents = weighedCents(item.pricePerKgCents, w.grams);
      if (item.substitutesItemId) {
        // A weighed replacement is never charged above the price of the units it replaces.
        const original = items.find((o) => o.id === item.substitutesItemId);
        if (original) {
          finalCents = cappedSwapCents(original.unitPriceCents, item.quantity, finalCents);
        }
      }
      await repo.setWeighing(tx, item.id, w.grams, finalCents);
      item.weighedGrams = w.grams;
      item.finalCents = finalCents;
    }
    return { order, items, alreadyCaptured: false as const };
  });
  if (plan.alreadyCaptured) {
    return {
      orderNumber: plan.order.number,
      authorizedCents: plan.order.authorizedCents ?? plan.order.totalCents,
      capturedCents: plan.order.capturedCents ?? 0,
      alreadyCaptured: true,
    };
  }
  const { amountCents, capped } = finalAmountCents(plan.order, plan.items);
  const note = capped
    ? `Captured the authorised ${amountCents}: the weighed amount was higher`
    : opts.note;
  return capturePayment(deps, orderId, amountCents, opts.actor, note);
}

export interface OverdueResult {
  examined: number;
  captured: number;
  failed: number;
}

/** An authorisation lasts 7 days at Stripe; capture before it can lapse. */
export const CAPTURE_OVERDUE_DAYS = 5;

/**
 * Orders authorised more than five days ago and still not captured are captured at the estimate
 * (weighed lines as weighed if they were, else as estimated): never risk the hold lapsing.
 */
export async function captureOverdue(
  deps: CaptureDeps,
  now: Date = new Date(),
): Promise<OverdueResult> {
  const cutoff = new Date(now.getTime() - CAPTURE_OVERDUE_DAYS * 86_400_000);
  const due = await db
    .select({ id: orders.id, number: orders.number })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(payments.captureMethod, 'manual'),
        eq(payments.status, 'authorized'),
        isNull(orders.capturedCents),
        inArray(orders.status, ['paid', 'processing', 'shipped', 'delivered']),
        lt(orders.placedAt, cutoff),
      ),
    )
    .orderBy(asc(orders.placedAt))
    .limit(100);
  const result: OverdueResult = { examined: due.length, captured: 0, failed: 0 };
  for (const o of due) {
    try {
      const done = await finalizeOrder(deps, o.id, {
        actor: 'system:capture-overdue',
        note: 'Captured automatically: authorised more than 5 days ago',
      });
      if (!done.alreadyCaptured) result.captured += 1;
    } catch (err) {
      result.failed += 1;
      deps.log.error({ err, orderNumber: o.number }, 'capture-overdue failed for an order');
    }
  }
  return result;
}
