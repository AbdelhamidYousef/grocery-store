import {
  AdminProductContentInputSchema,
  AdminProductContentResponseSchema,
  AdminSizeGuideDeleteResponseSchema,
  AdminSizeGuideInputSchema,
  AdminSizeGuideListResponseSchema,
  AdminSizeGuideResponseSchema,
  IdParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../../lib/validate.ts';
import { setAudit } from '../audit.ts';

import * as service from './service.ts';

// Product-page content (specs, FAQs, feeding table, constituents, size guide) and the size guide
// library. Mounted under /admin behind requireAdmin and the audit log. PUT replaces whole sections
// because the editors submit whole lists.
export function createPdpAdminRouter(): Router {
  const router = ExpressRouter();
  const byId = { params: IdParamsSchema };

  router.get('/products/:id/content', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    respond(res, AdminProductContentResponseSchema, { data: await service.getContent(params.id) });
  });

  const putContent = { params: IdParamsSchema, body: AdminProductContentInputSchema };
  router.put('/products/:id/content', validate(putContent), async (req, res) => {
    const { params, body } = valid(req, putContent);
    setAudit(res, 'product.content.update', params.id);
    respond(res, AdminProductContentResponseSchema, {
      data: await service.putContent(params.id, body),
    });
  });

  router.get('/size-guides', async (_req, res) => {
    respond(res, AdminSizeGuideListResponseSchema, { data: await service.listSizeGuides() });
  });

  const guideBody = { body: AdminSizeGuideInputSchema };
  router.post('/size-guides', validate(guideBody), async (req, res) => {
    const { body } = valid(req, guideBody);
    const guide = await service.createSizeGuide(body);
    setAudit(res, 'size_guide.create', guide.id);
    res.status(201);
    respond(res, AdminSizeGuideResponseSchema, { data: guide });
  });

  const guideUpdate = { params: IdParamsSchema, body: AdminSizeGuideInputSchema };
  router.patch('/size-guides/:id', validate(guideUpdate), async (req, res) => {
    const { params, body } = valid(req, guideUpdate);
    setAudit(res, 'size_guide.update', params.id);
    respond(res, AdminSizeGuideResponseSchema, {
      data: await service.updateSizeGuide(params.id, body),
    });
  });

  router.delete('/size-guides/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'size_guide.delete', params.id);
    respond(res, AdminSizeGuideDeleteResponseSchema, {
      data: await service.deleteSizeGuide(params.id),
    });
  });

  return router;
}
