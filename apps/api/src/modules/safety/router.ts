import { ActiveSafetyNoticesResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond } from '../../lib/validate.ts';
import { publicCache } from '../../middleware/cache.ts';

import { listActiveNotices } from './service.ts';

export const safetyRouter: Router = ExpressRouter();

safetyRouter.use('/safety-notices', publicCache);

safetyRouter.get('/safety-notices/active', async (_req, res) => {
  respond(res, ActiveSafetyNoticesResponseSchema, { data: await listActiveNotices() });
});
