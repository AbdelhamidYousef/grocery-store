import {
  AdminBundleCreateSchema,
  AdminBundleDeleteResponseSchema,
  AdminBundleListResponseSchema,
  AdminBundleResponseSchema,
  AdminBundleUpdateSchema,
  AdminBundleVariantsResponseSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';
import { z } from 'zod';

import { respond, valid, validate } from '../../../lib/validate.ts';
import { setAudit } from '../audit.ts';

import * as service from './service.ts';

// Kits (bundles). The bundle is addressed by its variant id: a kit is one product with one variant.
export function createBundlesAdminRouter(): Router {
  const router = ExpressRouter();
  const byVariant = { params: z.object({ variantId: z.uuid() }) };

  router.get('/bundles', async (_req, res) => {
    respond(res, AdminBundleListResponseSchema, { data: await service.listBundles() });
  });

  // Declared before `/bundles/:variantId` so "variants" is not read as an id.
  const optionsQuery = { query: z.object({ q: z.string().trim().max(60).optional() }) };
  router.get('/bundles/variants', validate(optionsQuery), async (req, res) => {
    const { query } = valid(req, optionsQuery);
    respond(res, AdminBundleVariantsResponseSchema, {
      data: await service.variantOptions(query.q),
    });
  });

  const create = { body: AdminBundleCreateSchema };
  router.post('/bundles', validate(create), async (req, res) => {
    const { body } = valid(req, create);
    const bundle = await service.createBundle(body);
    setAudit(res, 'bundle.create', bundle.variantId);
    res.status(201);
    respond(res, AdminBundleResponseSchema, { data: bundle });
  });

  const update = { ...byVariant, body: AdminBundleUpdateSchema };
  router.patch('/bundles/:variantId', validate(update), async (req, res) => {
    const { params, body } = valid(req, update);
    setAudit(res, 'bundle.update', params.variantId);
    respond(res, AdminBundleResponseSchema, {
      data: await service.updateBundle(params.variantId, body),
    });
  });

  router.delete('/bundles/:variantId', validate(byVariant), async (req, res) => {
    const { params } = valid(req, byVariant);
    setAudit(res, 'bundle.archive', params.variantId);
    respond(res, AdminBundleDeleteResponseSchema, {
      data: await service.archiveBundle(params.variantId),
    });
  });

  return router;
}
