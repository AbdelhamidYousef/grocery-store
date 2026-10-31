import { ErrorCode } from '@store/shared';
import express, { Router as ExpressRouter, type Router } from 'express';

import { AppError } from '../../lib/errors.ts';
import { WebhookSignatureError, type PaymentGateway } from '../../lib/stripe.ts';
import type { Outbox } from '../mail/outbox.ts';

import { processStripeEvent } from './payment-events.ts';

// Must be mounted BEFORE `express.json()` (see app.ts). Stripe signs the exact bytes it sent;
// once a JSON parser has turned them into an object and back, whitespace and key order may differ
// and the signature no longer matches. `express.raw` keeps the body as a Buffer for the check.
export function createWebhookRouter(deps: { payments: PaymentGateway; outbox: Outbox }): Router {
  const router = ExpressRouter();

  router.post(
    '/webhooks/stripe',
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req, res) => {
      const raw: unknown = req.body;
      if (!Buffer.isBuffer(raw)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Webhook body must be application/json');
      }

      let event;
      try {
        event = deps.payments.constructWebhookEvent(raw, req.get('stripe-signature'));
      } catch (err) {
        // A bad signature is the caller's fault (400, and Stripe will not retry it into success);
        // anything else (e.g. not configured) keeps its own status.
        if (err instanceof WebhookSignatureError) {
          req.log.warn({ reason: err.message }, 'webhook signature rejected');
          throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid webhook signature');
        }
        throw err;
      }

      // Answer 2xx only after the event is stored AND handled: if handling fails we return 500
      // (from the error middleware) so Stripe redelivers, which is safe because processing is
      // idempotent. A duplicate delivery also gets 200 immediately.
      const outcome = await processStripeEvent(event, req.log);
      // Emails owed by this event are already committed; sending them is a separate, best-effort
      // step that can never fail the webhook.
      deps.outbox.kick();
      res.json({ data: { received: true, duplicate: outcome === 'duplicate' } });
    },
  );

  return router;
}
