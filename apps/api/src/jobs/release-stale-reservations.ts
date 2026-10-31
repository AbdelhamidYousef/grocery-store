import { and, asc, eq, lt, sql } from 'drizzle-orm';
import type { Logger } from 'pino';

import { db } from '../db/client.ts';
import { orders } from '../db/schema/index.ts';
import type { PaymentGateway } from '../lib/stripe.ts';
import { cancelPendingOrder } from '../modules/checkout/orders.ts';
import { confirmPayment } from '../modules/checkout/payment-events.ts';
import * as repo from '../modules/checkout/repo.ts';

const ACTOR = 'system:reconciler';
export const STALE_AFTER_MS = 30 * 60_000;
const SWEEP_EVERY_MS = 5 * 60_000;
// Bounds one sweep, so a backlog (the API was down for a day) is worked off over a few sweeps
// instead of one run holding the process for minutes.
const BATCH = 100;
// Arbitrary but fixed: every instance of this app asks Postgres for the same advisory lock.
const ADVISORY_LOCK_KEY = 80_700_001;

export interface SweepResult {
  /** Stale orders looked at. */
  examined: number;
  /** Cancelled, intent cancelled, stock given back. */
  released: number;
  /** Paid at Stripe but the webhook never arrived: now marked paid. */
  recovered: number;
  /** Left alone: a payment is in flight, or the amounts need a human. */
  skipped: number;
  /** A provider or database error on this order; the next sweep retries it. */
  failed: number;
}

// The safety net for lost webhooks and abandoned checkouts. Webhooks are the fast path, but a
// delivery can be lost (Stripe gave up, we were down, a deploy dropped it) and shoppers close the
// tab after reserving stock. For each order still `pending_payment` after 30 minutes the truth
// is asked of Stripe itself:
//   - succeeded  -> the payment happened: mark it paid with the SAME `confirmPayment` the webhook
//                   uses (so "paid" means one thing), as if the event had arrived;
//   - processing -> money is in flight, leave it for the webhook or a later sweep;
//   - anything else -> the shopper walked away: cancel the intent (so a late tab cannot still
//                   pay a released order), cancel the order and give the stock back.
// Each order is handled on its own, so one failure never blocks the others.
export async function releaseStaleReservations(opts: {
  gateway: PaymentGateway;
  log: Logger;
  now?: Date;
  olderThanMs?: number;
}): Promise<SweepResult> {
  const { gateway, log } = opts;
  const cutoff = new Date(
    (opts.now ?? new Date()).getTime() - (opts.olderThanMs ?? STALE_AFTER_MS),
  );
  const result: SweepResult = { examined: 0, released: 0, recovered: 0, skipped: 0, failed: 0 };

  const stale = await db
    .select({ id: orders.id, number: orders.number })
    .from(orders)
    .where(and(eq(orders.status, 'pending_payment'), lt(orders.createdAt, cutoff)))
    .orderBy(asc(orders.createdAt))
    .limit(BATCH);

  const release = async (orderId: string, note: string) => {
    const cancelled = await db.transaction((tx) =>
      cancelPendingOrder(tx, orderId, { actor: ACTOR, note }),
    );
    result[cancelled ? 'released' : 'skipped'] += 1;
  };
  const recover = async (intent: { id: string; amountReceivedCents: number; currency: string }) => {
    const outcome = await db.transaction((tx) =>
      confirmPayment(
        tx,
        {
          paymentIntentId: intent.id,
          amountReceivedCents: intent.amountReceivedCents,
          currency: intent.currency,
        },
        ACTOR,
        log,
      ),
    );
    result[outcome === 'paid' ? 'recovered' : 'skipped'] += 1;
  };

  for (const { id: orderId, number } of stale) {
    result.examined += 1;
    try {
      const payment = await repo.findPaymentByOrder(db, orderId);
      if (!payment?.providerPaymentIntentId) {
        // The order committed but the process died before Stripe was called (the outbox gap):
        // there is nothing to pay, so just give the stock back.
        await release(orderId, 'Abandoned before a payment intent was created');
        continue;
      }

      const intent = await gateway.retrievePaymentIntent(payment.providerPaymentIntentId);
      if (intent.status === 'succeeded') {
        await recover(intent);
        continue;
      }
      if (intent.status === 'processing') {
        result.skipped += 1;
        continue;
      }

      // Cancel the intent first. If the shopper paid in the meantime Stripe refuses and reports
      // `succeeded`, and then the right move is to confirm, not to cancel.
      const after = await gateway.cancelPaymentIntent(intent.id);
      if (after.status === 'succeeded') await recover(after);
      else await release(orderId, 'Payment not completed within 30 minutes');
    } catch (err) {
      result.failed += 1;
      log.error({ err, orderNumber: number }, 'stale reservation sweep failed for an order');
    }
  }

  if (result.examined > 0) log.info(result, 'stale reservation sweep finished');
  return result;
}

// One sweep at a time across ALL instances: a Postgres advisory lock (held for the duration of a
// transaction, so it is released even if the process dies). Returns null when another instance is
// already sweeping. This keeps "only one runs" true without a scheduler service; a real
// deployment with many instances would still prefer a proper cron/queue worker.
export async function runExclusiveSweep(opts: {
  gateway: PaymentGateway;
  log: Logger;
  now?: Date;
}): Promise<SweepResult | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${ADVISORY_LOCK_KEY}) as locked`,
    );
    if (!row?.locked) return null;
    // The sweep itself uses other connections: this transaction only keeps the lock alive.
    return releaseStaleReservations(opts);
  });
}

// Runs inside the API process (`ENABLE_JOBS`), every 5 minutes, plus once shortly after boot
// because a free-tier host sleeps and restarts often. Timers are unref'd so they never keep the
// process alive during shutdown.
export function startReservationSweeper(opts: {
  gateway: PaymentGateway;
  log: Logger;
  intervalMs?: number;
  firstRunDelayMs?: number;
}): { stop: () => void } {
  const tick = () => {
    runExclusiveSweep(opts).catch((err: unknown) => {
      opts.log.error({ err }, 'stale reservation sweep crashed');
    });
  };
  const first = setTimeout(tick, opts.firstRunDelayMs ?? 10_000);
  const every = setInterval(tick, opts.intervalMs ?? SWEEP_EVERY_MS);
  first.unref();
  every.unref();
  return {
    stop: () => {
      clearTimeout(first);
      clearInterval(every);
    },
  };
}
