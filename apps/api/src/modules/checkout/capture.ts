import { ErrorCode, weighedCents } from '@store/shared';
import { and, asc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Logger } from 'pino';

import { db } from '../../db/client.ts';
import { orders, payments } from '../../db/schema/index.ts';
import { conflict, notFound, paymentProvider, unprocessable } from '../../lib/errors.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import { enqueueEmail } from '../mail/outbox.ts';

import * as repo from './repo.ts';

// Manual capture (G6). At checkout the card is only AUTHORISED (for the order total plus a buffer on
// weighed lines); after packing the real amount is CAPTURED, which may be lower than the hold, never
// higher. Two functions, in this order of trust:
//
//   capturePayment   the primitive. One amount, validated against the authorised amount BEFORE
//                    Stripe is called (422), captured with the idempotency key `capture:<order id>`
//                    (a retry takes nothing twice), recorded once on the order.
//   finalizeOrder    works out the amount from the order (weighed lines at their real price, all
//                    other lines as priced) and calls capturePayment. Picking (G8) will call it; until
//                    then the admin's "Capture now" does, and the `capture-overdue` job at the estimate.

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

/**
 * The final amount of an order, from its lines: the order total (every line as priced, discounts
 * included) corrected by what each WEIGHED line really costs (`final_cents`, from the packed grams)
 * instead of its estimate. A weighed line not weighed yet stays at its estimate. The result is
 * capped at the authorised amount: a bag that weighs more than the 15 % buffer is charged the
 * hold (we absorb the rest), never more.
 */
export function finalAmountCents(
  order: Pick<repo.OrderRow, 'totalCents' | 'authorizedCents'>,
  items: Pick<repo.OrderItemRow, 'lineTotalCents' | 'finalCents'>[],
): { amountCents: number; capped: boolean } {
  const delta = items.reduce(
    (sum, i) => sum + (i.finalCents === null ? 0 : i.finalCents - i.lineTotalCents),
    0,
  );
  const raw = order.totalCents + delta;
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
      const finalCents = weighedCents(item.pricePerKgCents, w.grams);
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
