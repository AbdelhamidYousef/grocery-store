import {
  AdminSafetyInputSchema,
  AdminSafetyListResponseSchema,
  AdminSafetyNotifyResponseSchema,
  AdminSafetyResponseSchema,
  IdParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { setAudit } from '../admin/audit.ts';
import type { Outbox } from '../mail/outbox.ts';

import * as service from './service.ts';

export function createSafetyAdminRouter(deps: { outbox: Outbox }): Router {
  const router = ExpressRouter();
  const byId = { params: IdParamsSchema };

  router.get('/safety-notices', async (_req, res) => {
    respond(res, AdminSafetyListResponseSchema, { data: await service.listAdminNotices() });
  });

  const body = { body: AdminSafetyInputSchema };
  router.post('/safety-notices', validate(body), async (req, res) => {
    const { body: input } = valid(req, body);
    const notice = await service.createNotice(input);
    setAudit(res, 'safety_notice.create', notice.id);
    res.status(201);
    respond(res, AdminSafetyResponseSchema, { data: notice });
  });

  router.get('/safety-notices/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    respond(res, AdminSafetyResponseSchema, { data: await service.getAdminNotice(params.id) });
  });

  const update = { params: IdParamsSchema, body: AdminSafetyInputSchema };
  router.put('/safety-notices/:id', validate(update), async (req, res) => {
    const { params, body: input } = valid(req, update);
    setAudit(res, 'safety_notice.update', params.id);
    respond(res, AdminSafetyResponseSchema, {
      data: await service.updateNotice(params.id, input),
    });
  });

  router.delete('/safety-notices/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'safety_notice.delete', params.id);
    await service.deleteNotice(params.id);
    res.status(204).end();
  });

  // Emails every past buyer of an affected variant once; safe to press again (see service).
  router.post('/safety-notices/:id/notify', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'safety_notice.notify', params.id);
    respond(res, AdminSafetyNotifyResponseSchema, {
      data: await service.notifyBuyers(params.id, deps),
    });
  });

  return router;
}
