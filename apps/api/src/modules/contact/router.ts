import { ContactBodySchema, ContactResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { createIpRateLimiter, type RateLimitOptions } from '../../middleware/rate-limit.ts';
import type { Outbox } from '../mail/outbox.ts';

import { submitContact } from './service.ts';

// 5 messages per hour per IP: plenty for a person, little for a script.
export const DEFAULT_CONTACT_LIMIT: RateLimitOptions = { windowMs: 60 * 60_000, limit: 5 };

export function createContactRouter(opts: {
  outbox: Outbox;
  contactRateLimit?: RateLimitOptions;
}): Router {
  const router = ExpressRouter();
  const send = { body: ContactBodySchema };
  router.post(
    '/contact',
    createIpRateLimiter(opts.contactRateLimit ?? DEFAULT_CONTACT_LIMIT),
    validate(send),
    async (req, res) => {
      const { body } = valid(req, send);
      res.status(201);
      respond(res, ContactResponseSchema, {
        data: await submitContact(body, { outbox: opts.outbox }),
      });
    },
  );
  return router;
}
