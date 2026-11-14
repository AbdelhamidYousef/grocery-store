import {
  AdminProductContentInputSchema,
  AdminProductContentResponseSchema,
  IdParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../../lib/validate.ts';
import { setAudit } from '../audit.ts';

import * as service from './service.ts';

// Product-page content (specs, FAQs, constituents). Mounted under /admin behind requireAdmin and the audit log. PUT replaces whole sections
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

  return router;
}
