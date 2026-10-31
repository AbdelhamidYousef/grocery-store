import { WithdrawalBodySchema, WithdrawalResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { createIpRateLimiter, type RateLimitOptions } from '../../middleware/rate-limit.ts';
import type { Outbox } from '../mail/outbox.ts';
import { DEFAULT_LOOKUP_LIMIT } from '../tracking/router.ts';

import { createWithdrawal } from './service.ts';

export function createWithdrawalsRouter(opts: {
  outbox: Outbox;
  lookupRateLimit?: RateLimitOptions;
}): Router {
  const router = ExpressRouter();
  const create = { body: WithdrawalBodySchema };
  router.post(
    '/withdrawals',
    createIpRateLimiter(opts.lookupRateLimit ?? DEFAULT_LOOKUP_LIMIT),
    validate(create),
    async (req, res) => {
      const { body } = valid(req, create);
      res.status(201);
      respond(res, WithdrawalResponseSchema, {
        data: await createWithdrawal(body, { outbox: opts.outbox }),
      });
    },
  );
  return router;
}
