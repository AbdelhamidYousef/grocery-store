import { Router as ExpressRouter, type Router } from 'express';

import type { PaymentGateway } from '../../lib/stripe.ts';
import { requireAdmin } from '../../middleware/auth.ts';
import type { Outbox } from '../mail/outbox.ts';
import { createMerchandisingAdminRouter } from '../merchandising/admin-router.ts';
import { createSafetyAdminRouter } from '../safety/admin-router.ts';

import { auditMutations } from './audit.ts';
import { createAdminContentRouter } from './content/router.ts';
import { createAdminOrdersRouter } from './orders/router.ts';
import { createProductsRouter } from './products/router.ts';
import { createStatsRouter } from './stats/router.ts';

// Everything under /admin is behind `requireAdmin` (401 for a guest, 403 for a customer) and the
// audit log. The guard is a single `router.use` on the prefix rather than a check in each route,
// so a route added later is protected by default and cannot forget it. `requireAdmin` runs before
// body or param validation, so a stranger learns nothing about a route's shape from its errors.
export function createAdminRouter(deps: { payments: PaymentGateway; outbox: Outbox }): Router {
  const router = ExpressRouter();
  router.use('/admin', requireAdmin, auditMutations);

  const admin = ExpressRouter();
  admin.use(createStatsRouter());
  admin.use(createProductsRouter());
  admin.use(createMerchandisingAdminRouter());
  admin.use(createAdminOrdersRouter(deps));
  admin.use(createSafetyAdminRouter(deps));
  admin.use(createAdminContentRouter());
  router.use('/admin', admin);
  return router;
}
