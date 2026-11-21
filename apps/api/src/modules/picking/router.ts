import {
  PickingQuerySchema,
  PickingResponseSchema,
  PickingStoreParamsSchema,
  PickLineActionSchema,
  PickLineParamsSchema,
  PickLineResponseSchema,
  PickStoresResponseSchema,
  SubstitutesResponseSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { adminActor } from '../admin/actor.ts';
import { setAudit } from '../admin/audit.ts';

import { getPicking, listStores, markLine, substitutesForLine } from './service.ts';

// The packer view's API, mounted under /admin (behind requireAdmin and the audit log).
export function createPickingAdminRouter(): Router {
  const router = ExpressRouter();

  router.get('/stores', async (_req, res) => {
    respond(res, PickStoresResponseSchema, { data: await listStores() });
  });

  const picking = { params: PickingStoreParamsSchema, query: PickingQuerySchema };
  router.get('/stores/:slug/picking', validate(picking), async (req, res) => {
    const { params, query } = valid(req, picking);
    respond(res, PickingResponseSchema, {
      data: await getPicking(params.slug, query.window, new Date(), undefined, query.order),
    });
  });

  const mark = { params: PickLineParamsSchema, body: PickLineActionSchema };
  router.post('/orders/:number/items/:itemId/pick', validate(mark), async (req, res) => {
    const { params, body } = valid(req, mark);
    setAudit(res, `order.pick.${body.action}`, params.number);
    respond(res, PickLineResponseSchema, {
      data: await markLine(params.number, params.itemId, body, adminActor(req)),
    });
  });

  // The best safe replacements for one line at the order's own store (what the packer may offer).
  const options = { params: PickLineParamsSchema };
  router.get('/orders/:number/items/:itemId/substitutes', validate(options), async (req, res) => {
    const { params } = valid(req, options);
    respond(res, SubstitutesResponseSchema, {
      data: await substitutesForLine(params.number, params.itemId),
    });
  });

  return router;
}
