import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { ErrorCode } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/client.ts';
import { conflict, forbidden, notFound, validation } from '../../lib/errors.ts';
import type { PaymentGateway, StripeEvent } from '../../lib/stripe.ts';
import { valid, validate } from '../../lib/validate.ts';
import type { Outbox } from '../mail/outbox.ts';

import { processStripeEvent } from './payment-events.ts';
import * as repo from './repo.ts';

// Test-only. `createModulesRouter` mounts this ONLY when NODE_ENV is `test` and a TEST_HOOK_SECRET
// is configured, so in development and production the URL does not exist (404), and in test mode
// every call must carry the secret in `X-Test-Hook-Secret` (403 otherwise). It lets CI and Playwright finish a payment without the
// Stripe CLI: instead of Stripe calling the webhook, the test asks for the event Stripe would have
// sent, and it goes through exactly the same `processStripeEvent` (idempotency, amount check,
// stock, history) as a real delivery. Only the signature check is skipped, since there is no
// Stripe to sign it.
const SimulateSchema = z.object({
  orderNumber: z.string(),
  type: z
    .enum([
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'charge.refunded',
    ])
    .default('payment_intent.succeeded'),
  // Lets a test provoke the amount-mismatch path; defaults to the order total.
  amountReceivedCents: z.number().int().min(0).optional(),
  // Lets a test show a specific decline message.
  errorMessage: z.string().optional(),
});

// Compared as SHA-256 digests with timingSafeEqual: equal length for any input (timingSafeEqual
// throws otherwise) and no early exit that would leak how much of the secret matched.
const digest = (value: string) => createHash('sha256').update(value).digest();

export function createTestRouter(deps: {
  outbox: Outbox;
  payments: PaymentGateway;
  secret: string;
  /**
   * True when `payments` is the real Stripe client. The amounts in the simulated event then come
   * from the real PaymentIntent (so the handler's amount check compares what Stripe really
   * received with the order total); with the fake gateway they come from our own payment row.
   */
  realStripe: boolean;
}): Router {
  const router = ExpressRouter();

  router.use('/test', (req, _res, next) => {
    const given = req.get('x-test-hook-secret');
    if (given && timingSafeEqual(digest(given), digest(deps.secret))) {
      next();
      return;
    }
    next(forbidden('Missing or wrong X-Test-Hook-Secret'));
  });

  const simulate = { body: SimulateSchema };
  router.post('/test/webhooks/simulate', validate(simulate), async (req, res) => {
    const { body } = valid(req, simulate);
    const order = await repo.findOrderByNumber(body.orderNumber);
    if (!order) throw notFound('Order not found');
    const payment = await repo.findPaymentByOrder(db, order.id);
    if (!payment?.providerPaymentIntentId) {
      throw conflict(ErrorCode.CONFLICT, 'The order has no payment intent yet');
    }

    const intentId = payment.providerPaymentIntentId;
    let amount = payment.amountCents;
    let amountReceived = body.amountReceivedCents ?? payment.amountCents;
    let currency = payment.currency.toLowerCase();
    if (deps.realStripe) {
      // A made-up amount would defeat the point of asking Stripe, so it is refused, not ignored.
      if (body.amountReceivedCents !== undefined) {
        throw validation(
          { fieldErrors: { amountReceivedCents: ['Not allowed with a real Stripe key'] } },
          'The amounts come from Stripe when a real key is configured',
        );
      }
      const real = await deps.payments.retrievePaymentIntent(intentId);
      amount = real.amountCents;
      amountReceived = real.amountReceivedCents;
      currency = real.currency;
    }
    const intent = {
      id: intentId,
      object: 'payment_intent',
      amount,
      amount_received: amountReceived,
      currency,
      ...(body.errorMessage && { last_payment_error: { message: body.errorMessage } }),
    };
    const event: StripeEvent = {
      id: `evt_sim_${randomUUID()}`,
      type: body.type,
      data: {
        object:
          body.type === 'charge.refunded'
            ? {
                id: `ch_sim_${randomUUID()}`,
                object: 'charge',
                payment_intent: intentId,
                refunded: true,
              }
            : intent,
      },
    };

    const outcome = await processStripeEvent(event, req.log);
    deps.outbox.kick();
    res.json({ data: { eventId: event.id, type: event.type, outcome } });
  });

  return router;
}
