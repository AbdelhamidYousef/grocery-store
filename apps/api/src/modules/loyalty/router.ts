import { PointsResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond } from '../../lib/validate.ts';
import { requireUser } from '../../middleware/auth.ts';

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

  return router;
}
