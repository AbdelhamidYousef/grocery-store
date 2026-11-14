import { Router } from 'express';

import type { PaymentGateway } from '../lib/stripe.ts';
import type { UploadConfig } from '../lib/uploads.ts';
import { attachUser } from '../middleware/auth.ts';
import { noStore } from '../middleware/cache.ts';
import type { RateLimitOptions } from '../middleware/rate-limit.ts';

import { createAccountRouter } from './account/router.ts';
import { createAdminRouter } from './admin/router.ts';
import { createAuthRouter } from './auth/router.ts';
import { cartRouter } from './cart/router.ts';
import { catalogRouter } from './catalog/router.ts';
import { createCheckoutRouter } from './checkout/router.ts';
import { createTestRouter } from './checkout/test-router.ts';
import { createContactRouter } from './contact/router.ts';
import { galleryRouter } from './gallery/router.ts';
import { guidesRouter } from './guides/router.ts';
import { helpRouter } from './help/router.ts';
import { homeRouter } from './home/router.ts';
import { createJobsRouter } from './jobs/router.ts';
import { registerCharitySubscribers } from './loyalty/charity-service.ts';
import { registerReferralSubscribers } from './loyalty/referrals-service.ts';
import { createLoyaltyRouter, rewardsRouter } from './loyalty/router.ts';
import { registerLoyaltySubscribers } from './loyalty/service.ts';
import type { Outbox } from './mail/outbox.ts';
import { merchandisingRouter } from './merchandising/router.ts';
import { navigationRouter } from './navigation/router.ts';
import { createNewsletterRouter } from './newsletter/router.ts';
import { createPetsRouter } from './pets/router.ts';
import { promotionsRouter } from './promotions/router.ts';
import { registerPromotionSubscribers } from './promotions/service.ts';
import { createReviewsRouter } from './reviews/router.ts';
import { safetyRouter } from './safety/router.ts';
import { createSearchRouter } from './search/router.ts';
import { createStockAlertsRouter } from './stock-alerts/router.ts';
import { createTrackingRouter } from './tracking/router.ts';
import { registerTrialSubscribers } from './trials/service.ts';
import { createWishlistRouter } from './wishlist/router.ts';
import { createWithdrawalsRouter } from './withdrawals/router.ts';

// Every feature module is `router.ts` (http only) -> `service.ts` (rules, transactions) ->
// `repo.ts` (Drizzle). This file is the one place that knows which modules exist; each mounts at
// the root of /api/v1 and declares its own paths (`/products`, `/auth/login`, ...), so the paths
// in the API contract can be searched for verbatim in the code.
export function createModulesRouter(opts: {
  authRateLimit: RateLimitOptions;
  lookupRateLimit?: RateLimitOptions;
  contactRateLimit?: RateLimitOptions;
  newsletterRateLimit?: RateLimitOptions;
  stockAlertRateLimit?: RateLimitOptions;
  suggestRateLimit?: RateLimitOptions;
  reviewRateLimit?: RateLimitOptions;
  voteRateLimit?: RateLimitOptions;
  uploads: UploadConfig;
  payments: PaymentGateway;
  outbox: Outbox;
  nodeEnv: 'development' | 'test' | 'production';
  jobsSecret?: string;
  testHooks?: { secret: string; realStripe: boolean };
}): Router {
  const router = Router();
  // Features that react to an order changing register here, once (see orders/events.ts).
  registerTrialSubscribers();
  registerPromotionSubscribers();
  registerLoyaltySubscribers();
  registerCharitySubscribers();
  registerReferralSubscribers();
  router.use(catalogRouter);
  router.use(merchandisingRouter);
  router.use(guidesRouter);
  // Public and the same for everyone (published photos, active products), so before the session.
  router.use(galleryRouter);
  router.use(helpRouter);
  router.use(homeRouter);
  router.use(safetyRouter);
  router.use(promotionsRouter);
  router.use(rewardsRouter);
  // Public and identical for everyone, so it sits before the session middleware like the catalog.
  router.use(createSearchRouter(opts));
  router.use(navigationRouter);
  // Secret-header authenticated, no session: scheduled work trigger (see jobs/router.ts).
  router.use(
    createJobsRouter({ secret: opts.jobsSecret, payments: opts.payments, outbox: opts.outbox }),
  );
  // Exists only under NODE_ENV=test with a TEST_HOOK_SECRET (see test-router.ts): no way to fake a
  // payment anywhere else.
  if (opts.nodeEnv === 'test' && opts.testHooks) {
    router.use(
      createTestRouter({
        outbox: opts.outbox,
        payments: opts.payments,
        secret: opts.testHooks.secret,
        realStripe: opts.testHooks.realStripe,
      }),
    );
  }
  // Everything below depends on who is asking, so it is mounted after the catalog: public catalog
  // responses stay cookie-free and cacheable, and never trigger a session lookup.
  router.use(attachUser);
  router.use(noStore);
  router.use(createAuthRouter(opts));
  router.use(createAccountRouter(opts));
  router.use(createPetsRouter());
  router.use(createReviewsRouter(opts));
  router.use(createLoyaltyRouter());
  router.use(createNewsletterRouter(opts));
  router.use(createStockAlertsRouter(opts));
  router.use(createWishlistRouter());
  router.use(cartRouter);
  router.use(createTrackingRouter(opts));
  router.use(createWithdrawalsRouter(opts));
  router.use(createContactRouter(opts));
  router.use(createCheckoutRouter({ payments: opts.payments }));
  router.use(
    createAdminRouter({ payments: opts.payments, outbox: opts.outbox, uploads: opts.uploads }),
  );
  return router;
}
