import {
  NewsletterConfirmResponseSchema,
  NewsletterSubscribeResponseSchema,
  NewsletterSubscribeSchema,
  NewsletterTokenSchema,
  NewsletterUnsubscribeResponseSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { createIpRateLimiter, type RateLimitOptions } from '../../middleware/rate-limit.ts';
import type { Outbox } from '../mail/outbox.ts';

import * as service from './service.ts';

// 10 sign-ups an hour per IP: a household, an office, never a script.
export const DEFAULT_NEWSLETTER_LIMIT: RateLimitOptions = { windowMs: 60 * 60_000, limit: 10 };

// Mounted after `attachUser`, so a signed-in visitor's account is linked to the subscription.
export function createNewsletterRouter(opts: {
  outbox: Outbox;
  newsletterRateLimit?: RateLimitOptions;
}): Router {
  const router = ExpressRouter();
  const limit = createIpRateLimiter(opts.newsletterRateLimit ?? DEFAULT_NEWSLETTER_LIMIT);
  // Links in the inbox are opened more often than the form is filled (mail scanners, retries).
  const tokenLimit = createIpRateLimiter({ windowMs: 60 * 60_000, limit: 60 });

  const subscribe = { body: NewsletterSubscribeSchema };
  router.post('/newsletter/subscribe', limit, validate(subscribe), async (req, res) => {
    const { body } = valid(req, subscribe);
    await service.subscribe({ ...body, userId: req.user?.id ?? null }, { outbox: opts.outbox });
    res.status(202);
    respond(res, NewsletterSubscribeResponseSchema, { data: { status: 'check_your_inbox' } });
  });

  const token = { body: NewsletterTokenSchema };
  router.post('/newsletter/confirm', tokenLimit, validate(token), async (req, res) => {
    const { body } = valid(req, token);
    const status = await service.confirm(body.token, { outbox: opts.outbox });
    respond(res, NewsletterConfirmResponseSchema, { data: { status } });
  });

  router.post('/newsletter/unsubscribe', tokenLimit, validate(token), async (req, res) => {
    const { body } = valid(req, token);
    await service.unsubscribe(body.token);
    respond(res, NewsletterUnsubscribeResponseSchema, { data: { status: 'unsubscribed' } });
  });

  return router;
}
