import {
  AdminMenuPromoInputSchema,
  AdminMenuPromoListResponseSchema,
  AdminMenuPromoResponseSchema,
  AdminMenuPromoUpdateSchema,
  IdParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { setAudit } from '../admin/audit.ts';

import * as service from './service.ts';

// Mounted under /admin behind requireAdmin and the audit log (see admin/router.ts).
export function createNavigationAdminRouter(): Router {
  const router = ExpressRouter();

  router.get('/menu-promos', async (_req, res) => {
    respond(res, AdminMenuPromoListResponseSchema, { data: await service.adminListPromos() });
  });

  const create = { body: AdminMenuPromoInputSchema };
  router.post('/menu-promos', validate(create), async (req, res) => {
    const { body } = valid(req, create);
    const promo = await service.createPromo(body);
    setAudit(res, 'menu_promo.create', promo.id);
    res.status(201);
    respond(res, AdminMenuPromoResponseSchema, { data: promo });
  });

  const update = { params: IdParamsSchema, body: AdminMenuPromoUpdateSchema };
  router.patch('/menu-promos/:id', validate(update), async (req, res) => {
    const { params, body } = valid(req, update);
    setAudit(res, 'menu_promo.update', params.id);
    respond(res, AdminMenuPromoResponseSchema, {
      data: await service.updatePromo(params.id, body),
    });
  });

  const byId = { params: IdParamsSchema };
  router.delete('/menu-promos/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'menu_promo.delete', params.id);
    await service.deletePromo(params.id);
    res.status(204).end();
  });

  return router;
}
