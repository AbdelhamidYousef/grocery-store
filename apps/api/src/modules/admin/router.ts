import { Router as ExpressRouter, type Router } from 'express';

import { requireAdmin } from '../../middleware/auth.ts';

import { auditMutations } from './audit.ts';
import { createStatsRouter } from './stats/router.ts';

// Everything under /admin is behind `requireAdmin` (401 for a guest, 403 for a customer) and the
// audit log. The guard is a single `router.use` on the prefix rather than a check in each route,
// so a route added later is protected by default and cannot forget it. `requireAdmin` runs before
// body or param validation, so a stranger learns nothing about a route's shape from its errors.
export function createAdminRouter(): Router {
  const router = ExpressRouter();
  router.use('/admin', requireAdmin, auditMutations);

  const admin = ExpressRouter();
  admin.use(createStatsRouter());
  router.use('/admin', admin);
  return router;
}
