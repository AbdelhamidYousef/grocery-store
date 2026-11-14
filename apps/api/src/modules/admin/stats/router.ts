import { AdminStatsQuerySchema, AdminStatsResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../../lib/validate.ts';

import * as service from './service.ts';

export function createStatsRouter(): Router {
  const router = ExpressRouter();
  const stats = { query: AdminStatsQuerySchema };
  router.get('/stats', validate(stats), async (req, res) => {
    const { query } = valid(req, stats);
    respond(res, AdminStatsResponseSchema, {
      data: await service.getStats(new Date(), query.currency),
    });
  });
  return router;
}
