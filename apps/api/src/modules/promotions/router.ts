import { BannerResponseSchema, PromotionRulesResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond } from '../../lib/validate.ts';
import { publicCache } from '../../middleware/cache.ts';

import * as service from './service.ts';

// Public: no session lookup, so it is mounted before `attachUser`.
export const promotionsRouter: Router = ExpressRouter();

// Never cached: `serverNow` must be the server's clock at the moment of the request, and a sale
// can start or end between two requests.
promotionsRouter.get('/promotions/banner', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  respond(res, BannerResponseSchema, { data: await service.getBanner() });
});

promotionsRouter.get('/promotions/rules', publicCache, async (_req, res) => {
  respond(res, PromotionRulesResponseSchema, { data: await service.getRules() });
});
