import { AdminStatsResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond } from '../../../lib/validate.ts';

import * as service from './service.ts';

export function createStatsRouter(): Router {
  const router = ExpressRouter();
  router.get('/stats', async (_req, res) => {
    respond(res, AdminStatsResponseSchema, { data: await service.getStats() });
  });
  return router;
}
