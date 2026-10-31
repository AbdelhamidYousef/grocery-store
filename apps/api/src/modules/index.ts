import { Router } from 'express';

import { adminRouter } from './admin/router.ts';
import { authRouter } from './auth/router.ts';
import { cartRouter } from './cart/router.ts';
import { catalogRouter } from './catalog/router.ts';
import { checkoutRouter } from './checkout/router.ts';

// Every feature module is `router.ts` (http only) -> `service.ts` (rules, transactions) ->
// `repo.ts` (Drizzle). This file is the one place that knows which modules exist; each mounts at
// the root of /api/v1 and declares its own paths (`/products`, `/auth/login`, ...), so the paths
// in the API contract can be searched for verbatim in the code.
export function createModulesRouter(): Router {
  const router = Router();
  router.use(catalogRouter);
  router.use(authRouter);
  router.use(cartRouter);
  router.use(checkoutRouter);
  router.use(adminRouter);
  return router;
}
