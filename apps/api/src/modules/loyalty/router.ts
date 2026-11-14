import {
  IdParamsSchema,
  PersonalCodeListResponseSchema,
  PointsResponseSchema,
  RedeemRewardResponseSchema,
  RewardListResponseSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { requireUser } from '../../middleware/auth.ts';
import { publicCache } from '../../middleware/cache.ts';

import * as rewards from './rewards-service.ts';
import * as service from './service.ts';

// The signed-in customer's loyalty area, mounted after `attachUser` (nothing here is cacheable).
export function createLoyaltyRouter(): Router {
  const router = ExpressRouter();
  router.use('/me', requireUser);

  const userId = (req: { user: { id: string } | null }): string => {
    if (!req.user) throw new Error('requireUser let an anonymous request through');
    return req.user.id;
  };

  router.get('/me/points', async (req, res) => {
    respond(res, PointsResponseSchema, { data: await service.getSummary(userId(req)) });
  });

  router.get('/me/codes', async (req, res) => {
    respond(res, PersonalCodeListResponseSchema, { data: await rewards.listMyCodes(userId(req)) });
  });

  const redeem = { params: IdParamsSchema };
  router.post('/me/rewards/:id/redeem', validate(redeem), async (req, res) => {
    const { params } = valid(req, redeem);
    res.status(201);
    respond(res, RedeemRewardResponseSchema, {
      data: await rewards.redeem(userId(req), params.id),
    });
  });

  return router;
}

// Public and identical for everyone (the shop window), so it is mounted before the session
// middleware with the catalogue's cache header.
export const rewardsRouter: Router = ExpressRouter();
rewardsRouter.get('/rewards', publicCache, async (_req, res) => {
  respond(res, RewardListResponseSchema, { data: await rewards.listPublic() });
});
