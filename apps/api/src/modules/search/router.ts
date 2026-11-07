import { SuggestQuerySchema, SuggestResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { createIpRateLimiter, type RateLimitOptions } from '../../middleware/rate-limit.ts';

import * as service from './service.ts';

// 60 a minute per IP: a fast typist with a 200 ms debounce sends ~5 a second at most while
// typing, and the web aborts what it no longer needs, so a person stays far below it.
export const DEFAULT_SUGGEST_LIMIT: RateLimitOptions = { windowMs: 60_000, limit: 60 };

// Cached for 30 s: the same prefix typed by many shoppers is answered by the CDN, and a product
// that was just archived disappears from suggestions within half a minute. No `attachUser`, no
// cookie, no `Vary: Cookie`: the answer is identical for everyone (see service.ts).
export function createSearchRouter(opts: { suggestRateLimit?: RateLimitOptions }): Router {
  const router = ExpressRouter();
  const suggest = { query: SuggestQuerySchema };
  router.get(
    '/search/suggest',
    createIpRateLimiter(opts.suggestRateLimit ?? DEFAULT_SUGGEST_LIMIT),
    validate(suggest),
    async (req, res) => {
      const { query } = valid(req, suggest);
      res.setHeader('Cache-Control', 'public, max-age=30');
      respond(res, SuggestResponseSchema, { data: await service.suggest(query.q) });
    },
  );
  return router;
}
