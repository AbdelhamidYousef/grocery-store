import { NavigationResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond } from '../../lib/validate.ts';
import { publicCache } from '../../middleware/cache.ts';

import * as service from './service.ts';

// Public, cookie-free and cacheable like the rest of the catalog: mounted before the session
// middleware, so no cookie is read and every cache may keep it for a minute.
export const navigationRouter: Router = ExpressRouter();
navigationRouter.use('/navigation', publicCache);

navigationRouter.get('/navigation', async (_req, res) => {
  respond(res, NavigationResponseSchema, { data: await service.getNavigation() });
});
