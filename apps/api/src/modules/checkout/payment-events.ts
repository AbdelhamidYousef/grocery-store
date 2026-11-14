import type { Logger } from 'pino';
import { z } from 'zod';

import { db, type Tx } from '../../db/client.ts';
import type { StripeEvent } from '../../lib/stripe.ts';
import { canTransition } from '../orders/state-machine.ts';
import { applyTransition } from '../orders/transition.ts';
import { hasRefundInFlight } from '../returns/refunded.ts';
import { queueVetEmail } from '../vet/admin-service.ts';
import { findVetDetails } from '../vet/repo.ts';

import { cancelPendingOrder } from './orders.ts';
import * as repo from './repo.ts';

// Only the fields we read, so an unrelated Stripe change cannot break the parse.
const PaymentIntentObject = z.object({
  id: z.string(),
  amount_received: z.number().int().default(0),
  currency: z.string(),
  last_payment_error: z.object({ message: z.string().nullish() }).nullish(),
});
const ChargeObject = z.object({
  payment_intent: z.string().nullish(),
  // True only when the WHOLE charge has been refunded; a partial refund also fires the event.
  refunded: z.boolean(),
});

// A ZodError would reach the error middleware as a 400 ("your request is invalid"), which is wrong
// here: the request was authentic (signature verified) and the fault is ours or Stripe's, so it
// must be a 500 that stores the error and gets the event redelivered.
function parseObject<T extends z.ZodType>(schema: T, value: unknown, type: string): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`malformed ${type} event object: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export type ConfirmOutcome =
  'paid' | 'already_handled' | 'amount_mismatch' | 'paid_after_cancel' | 'unknown_payment';

export interface PaymentSucceeded {
  paymentIntentId: string;
  amountReceivedCents: number;
  currency: string;
}

// Turns a confirmed payment into a paid order. The only code that moves an order to `paid`: the
// webhook and the reconciler (8.7) both call it, so "paid" means the same thing whichever of the
// two noticed first. Runs inside the caller's transaction.
//
// Lock order is order -> payment -> inventory, the same as every other order transition, so two
// signals about one order queue instead of deadlocking.
export async function confirmPayment(
  tx: Tx,
  event: PaymentSucceeded,
  actor: string,
  log: Logger,
): Promise<ConfirmOutcome> {
  const found = await repo.findPaymentByIntent(tx, event.paymentIntentId);
  if (!found) {
    // An intent we did not create (another integration on the same Stripe account, or a deleted
    // test row). Acknowledge it: failing would make Stripe retry something that can never succeed.
    log.warn({ paymentIntentId: event.paymentIntentId }, 'webhook for an unknown payment intent');
    return 'unknown_payment';
  }
  const order = await repo.lockOrder(tx, found.orderId);
  const payment = await repo.lockPayment(tx, found.id);
  if (!order || !payment) return 'unknown_payment';

  if (order.status === 'cancelled') {
    // Money arrived for an order we had already given up on (e.g. the sweeper cancelled it a
    // moment before the customer's card went through). We cannot ship it silently: record it
    // loudly so a human refunds it.
    const note = `Payment of ${event.amountReceivedCents} received after the order was cancelled: refund needed`;
    log.error({ orderId: order.id, paymentIntentId: event.paymentIntentId }, `ALARM: ${note}`);
    await repo.updatePayment(tx, payment.id, { status: 'succeeded', lastError: note });
    await repo.insertHistory(tx, {
      orderId: order.id,
      fromStatus: 'cancelled',
      toStatus: 'cancelled',
      actor,
      note,
    });
    return 'paid_after_cancel';
  }
  // Paid already (a duplicate signal from the other path) or further along: nothing to do.
  if (order.status !== 'pending_payment') return 'already_handled';

  // The amount that actually landed must be the amount we asked for. It always is unless
  // something is badly wrong (a tampered intent, a bug in the update path), and then shipping
  // goods against it would be the expensive mistake. Leave the order pending and shout.
  const sameAmount = event.amountReceivedCents === order.totalCents;
  const sameCurrency = event.currency.toLowerCase() === order.currency.toLowerCase();
  if (!sameAmount || !sameCurrency) {
    const note = `Amount mismatch: received ${event.amountReceivedCents} ${event.currency}, expected ${order.totalCents} ${order.currency}`;
    log.error({ orderId: order.id, paymentIntentId: event.paymentIntentId }, `ALARM: ${note}`);
    await repo.updatePayment(tx, payment.id, { lastError: note });
    await repo.insertHistory(tx, {
      orderId: order.id,
      fromStatus: 'pending_payment',
      toStatus: 'pending_payment',
      actor,
      note,
    });
    return 'amount_mismatch';
  }

  // Stock commit, payment row, cart and history all happen inside the state machine.
  const paidOrder = await applyTransition(tx, order, 'paid', { actor });
  // The confirmation email was queued by applyTransition, in this same transaction.

  // An order with a vet-approval item does not go to packing: it waits for an admin's decision
  // (phase 22). Same transaction, so the order is never visible as plain `paid` and then moved.
  // Stock stays committed meanwhile (the units are held, not on the shelf).
  if (await findVetDetails(tx, order.id)) {
    await applyTransition(tx, paidOrder, 'awaiting_vet_approval', {
      actor,
      note: "Waiting for a vet's approval",
    });
    await queueVetEmail(tx, 'vet_held', paidOrder);
  }
  return 'paid';
}

async function paymentFailed(tx: Tx, intent: z.infer<typeof PaymentIntentObject>) {
  const found = await repo.findPaymentByIntent(tx, intent.id);
  if (!found) return;
  await repo.lockOrder(tx, found.orderId);
  const payment = await repo.lockPayment(tx, found.id);
  // A late "failed" must not undo a success that was already recorded (events can arrive out of
  // order), nor touch a payment whose order is gone.
  if (!payment || payment.status === 'succeeded' || payment.status === 'refunded') return;
  await repo.updatePayment(tx, payment.id, {
    status: 'failed',
    lastError: intent.last_payment_error?.message ?? 'The payment failed',
  });
  // The order stays `pending_payment` with its stock reserved: the customer can retry on the
  // same intent, and the sweeper releases it if they never do. A failed attempt is not an order
  // state change, so there is no history row.
}

async function refunded(tx: Tx, charge: z.infer<typeof ChargeObject>, actor: string) {
  if (!charge.refunded || !charge.payment_intent) return;
  const found = await repo.findPaymentByIntent(tx, charge.payment_intent);
  if (!found) return;
  const order = await repo.lockOrder(tx, found.orderId);
  const payment = await repo.lockPayment(tx, found.id);
  if (!order || !payment) return;
  // Only an order that was actually paid can be refunded; the state machine knows which
  // statuses those are (including the provider-only ones: a dashboard refund mid-shipping).
  if (!canTransition(order.status, 'refunded', { fromProvider: true })) return;
  // A return is mid-refund (gateway called, not yet marked): this event IS its refund. The return
  // finishes the order itself (right amount, one event); acting here would count the money twice
  // and strand the return.
  if (order.status === 'delivered' && (await hasRefundInFlight(tx, order.id))) return;
  await applyTransition(tx, order, 'refunded', {
    actor,
    note: 'Refunded in Stripe',
    fromProvider: true,
  });
}

async function dispatch(tx: Tx, event: StripeEvent, log: Logger): Promise<void> {
  const actor = 'system:webhook';
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = parseObject(PaymentIntentObject, event.data.object, event.type);
      await confirmPayment(
        tx,
        {
          paymentIntentId: intent.id,
          amountReceivedCents: intent.amount_received,
          currency: intent.currency,
        },
        actor,
        log,
      );
      return;
    }
    case 'payment_intent.payment_failed':
      await paymentFailed(tx, parseObject(PaymentIntentObject, event.data.object, event.type));
      return;
    case 'payment_intent.canceled': {
      const intent = parseObject(PaymentIntentObject, event.data.object, event.type);
      const found = await repo.findPaymentByIntent(tx, intent.id);
      if (found) {
        await cancelPendingOrder(tx, found.orderId, { actor, note: 'Payment intent canceled' });
      }
      return;
    }
    case 'charge.refunded':
      await refunded(tx, parseObject(ChargeObject, event.data.object, event.type), actor);
      return;
    default:
      // Stripe sends every event type the endpoint is subscribed to; the ones we do not act on are
      // stored (audit) and acknowledged, never an error.
      return;
  }
}

export type EventOutcome = 'processed' | 'duplicate';

// Handles one verified event exactly once in effect:
//   - the event row and every state change commit together, or none do;
//   - the row is locked, so two simultaneous deliveries of one event queue and the second sees
//     `processed_at` already set and does nothing;
//   - if handling throws, the transaction rolls back (no half-applied order), the error is stored
//     on the event row, and the caller answers 500 so Stripe redelivers it.
export async function processStripeEvent(event: StripeEvent, log: Logger): Promise<EventOutcome> {
  try {
    return await db.transaction(async (tx) => {
      await repo.insertWebhookEvent(tx, {
        id: event.id,
        type: event.type,
        payload: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
      });
      const row = await repo.lockWebhookEvent(tx, event.id);
      if (row.processedAt) return 'duplicate';
      await dispatch(tx, event, log);
      await repo.markWebhookEventProcessed(tx, event.id);
      return 'processed';
    });
  } catch (err) {
    try {
      await repo.recordWebhookFailure({
        id: event.id,
        type: event.type,
        payload: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
        error: err instanceof Error ? err.message : String(err),
      });
    } catch (recordError) {
      log.error({ err: recordError, eventId: event.id }, 'could not store a webhook failure');
    }
    throw err;
  }
}
