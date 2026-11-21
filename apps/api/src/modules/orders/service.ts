import { ErrorCode, type OrderStatus } from '@store/shared';
import type { Logger } from 'pino';

import { db } from '../../db/client.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import * as repo from '../checkout/repo.ts';

import { InvalidTransitionError, assertTransition, requestableNext } from './state-machine.ts';
import { applyTransition } from './transition.ts';

const invalid = (err: InvalidTransitionError) =>
  conflict(ErrorCode.CONFLICT, err.message, {
    from: err.from,
    to: err.to,
    allowed: requestableNext(err.from),
  });

// Moves an order on request (the admin's "mark shipped" / "cancel" buttons). The sequence matters:
//
//   1. Validate against the state machine on an unlocked read, so a plain "no" costs no Stripe call.
//   2. Do the provider side FIRST and outside any transaction:
//        pending_payment -> cancelled : cancel the intent (if the customer paid in the meantime
//                                       Stripe says `succeeded` and we refuse: the webhook will
//                                       mark the order paid, and cancelling it would strand money);
//        money taken -> cancelled/refunded : refund through Stripe. The idempotency key is derived
//                                       from the order, so a retry never refunds twice.
//      Money moving is the part that cannot be rolled back, so it goes first and is retryable; a
//      database failure afterwards leaves a refund without a status change, which the admin simply
//      repeats (same key, Stripe answers "already done").
//   3. One transaction: lock the order, re-validate against the locked row, apply.
export async function transitionOrder(
  deps: { gateway: PaymentGateway; log: Logger },
  number: string,
  to: OrderStatus,
  ctx: { actor: string; note?: string | null },
): Promise<repo.OrderRow> {
  const seen = await repo.findOrderByNumber(number);
  if (!seen) throw notFound('Order not found');

  // `paid` is reached only through confirmPayment (a webhook or the reconciler), the single place
  // that checks the amount that really arrived. An admin cannot declare an order paid.
  if (to === 'paid') {
    throw conflict(ErrorCode.CONFLICT, 'An order becomes paid only when the payment is confirmed');
  }
  try {
    assertTransition(seen.status, to);
  } catch (err) {
    if (err instanceof InvalidTransitionError) throw invalid(err);
    throw err;
  }

  const payment = await repo.findPaymentByOrder(db, seen.id);
  const intentId = payment?.providerPaymentIntentId ?? null;
  if (to === 'cancelled' || to === 'refunded') {
    if (seen.status === 'pending_payment') {
      if (intentId) {
        const after = await deps.gateway.cancelPaymentIntent(intentId);
        if (after.status === 'succeeded') {
          throw conflict(
            ErrorCode.CONFLICT,
            'The customer has just paid; reload the order instead of cancelling it',
          );
        }
      }
    } else if (intentId && payment?.status === 'authorized') {
      // Only a hold, nothing was taken: cancelling the intent releases it (no refund exists to make).
      // If the money was captured in the meantime (the capture job, the Stripe dashboard) Stripe
      // answers `succeeded` instead, and then it is a real charge to give back.
      const after = await deps.gateway.cancelPaymentIntent(intentId);
      if (after.status === 'succeeded') {
        await deps.gateway.refundPaymentIntent(intentId, `refund:${seen.id}`);
      }
    } else if (intentId) {
      await deps.gateway.refundPaymentIntent(intentId, `refund:${seen.id}`);
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const order = await repo.lockOrder(tx, seen.id);
      if (!order) throw notFound('Order not found');
      return applyTransition(tx, order, to, ctx);
    });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      // Someone else moved the order between our read and our lock (a webhook, another admin).
      // If money was already refunded the order is in the state the refund implies anyway.
      deps.log.warn(
        { orderNumber: number, from: err.from, to: err.to },
        'order moved concurrently',
      );
      throw invalid(err);
    }
    throw err;
  }
}
