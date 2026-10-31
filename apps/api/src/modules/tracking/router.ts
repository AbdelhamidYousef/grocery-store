import { TrackOrderBodySchema, TrackOrderResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { createIpRateLimiter, type RateLimitOptions } from '../../middleware/rate-limit.ts';

import { trackOrder } from './service.ts';

// 10 lookups per hour per IP unless configured otherwise.
export const DEFAULT_LOOKUP_LIMIT: RateLimitOptions = { windowMs: 60 * 60_000, limit: 10 };

export function createTrackingRouter(opts: { lookupRateLimit?: RateLimitOptions }): Router {
  const router = ExpressRouter();

  const track = { body: TrackOrderBodySchema };
  router.post(
    '/orders/track',
    createIpRateLimiter(opts.lookupRateLimit ?? DEFAULT_LOOKUP_LIMIT),
    validate(track),
    async (req, res) => {
      const { body } = valid(req, track);
      respond(res, TrackOrderResponseSchema, { data: await trackOrder(body) });
    },
  );
  return router;
}
