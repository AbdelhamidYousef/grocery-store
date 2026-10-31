import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/client.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import type { StripeEvent } from '../../lib/stripe.ts';
import { valid, validate } from '../../lib/validate.ts';
import type { Outbox } from '../mail/outbox.ts';

import { processStripeEvent } from './payment-events.ts';
import * as repo from './repo.ts';

// Test-only. `createModulesRouter` mounts this ONLY when NODE_ENV is `test`, so in development and
// production the URL does not exist (404). It lets CI and Playwright finish a payment without the
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

export function createTestRouter(deps: { outbox: Outbox }): Router {
  const router = ExpressRouter();

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
    const intent = {
      id: intentId,
      object: 'payment_intent',
      amount: payment.amountCents,
      amount_received: body.amountReceivedCents ?? payment.amountCents,
      currency: payment.currency.toLowerCase(),
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
