import { Router as ExpressRouter, type Router } from 'express';

import type { PaymentGateway } from '../../lib/stripe.ts';
import type { UploadConfig } from '../../lib/uploads.ts';
import { requireAdmin } from '../../middleware/auth.ts';
import { createTranslationsAdminRouter } from '../i18n/admin-router.ts';
import { createLoyaltyAdminRouter } from '../loyalty/admin-router.ts';
import type { Outbox } from '../mail/outbox.ts';
import { createMerchandisingAdminRouter } from '../merchandising/admin-router.ts';
import { createNavigationAdminRouter } from '../navigation/admin-router.ts';
import { createPromotionsAdminRouter } from '../promotions/admin-router.ts';
import { createReturnsAdminRouter } from '../returns/admin-router.ts';
import type { ReturnsConfig } from '../returns/config.ts';
import { createReviewsAdminRouter } from '../reviews/admin-router.ts';
import { createSafetyAdminRouter } from '../safety/admin-router.ts';

import { createAnalyticsRouter } from './analytics/router.ts';
import { auditMutations } from './audit.ts';
import { createBundlesAdminRouter } from './bundles/router.ts';
import { createAdminContentRouter } from './content/router.ts';
import { createAdminOrdersRouter } from './orders/router.ts';
import { createPdpAdminRouter } from './pdp/router.ts';
import { createProductsRouter } from './products/router.ts';
import { createStatsRouter } from './stats/router.ts';

// Everything under /admin is behind `requireAdmin` (401 for a guest, 403 for a customer) and the
// audit log. The guard is a single `router.use` on the prefix rather than a check in each route,
// so a route added later is protected by default and cannot forget it. `requireAdmin` runs before
// body or param validation, so a stranger learns nothing about a route's shape from its errors.
export function createAdminRouter(deps: {
  payments: PaymentGateway;
  outbox: Outbox;
  uploads: UploadConfig;
  returns: ReturnsConfig;
}): Router {
  const router = ExpressRouter();
  router.use('/admin', requireAdmin, auditMutations);

  const admin = ExpressRouter();
  admin.use(createStatsRouter());
  admin.use(createAnalyticsRouter());
  admin.use(createProductsRouter());
  admin.use(createPdpAdminRouter());
  admin.use(createBundlesAdminRouter());
  admin.use(createMerchandisingAdminRouter());
  admin.use(createAdminOrdersRouter(deps));
  admin.use(createSafetyAdminRouter(deps));
  admin.use(createAdminContentRouter());
  admin.use(createPromotionsAdminRouter());
  admin.use(createNavigationAdminRouter());
  admin.use(createReviewsAdminRouter(deps));
  admin.use(createReturnsAdminRouter(deps));
  admin.use(createLoyaltyAdminRouter());
  admin.use(createTranslationsAdminRouter());
  router.use('/admin', admin);
  return router;
}
