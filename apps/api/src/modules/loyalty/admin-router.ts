import {
  AdminPointsAdjustResponseSchema,
  AdminPointsAdjustSchema,
  AdminRewardInputSchema,
  AdminRewardListResponseSchema,
  AdminRewardResponseSchema,
  IdParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { adminActor } from '../admin/actor.ts';
import { setAudit } from '../admin/audit.ts';

import * as rewards from './rewards-service.ts';
import * as service from './service.ts';

// Mounted under /admin behind requireAdmin and the audit log (see admin/router.ts).
export function createLoyaltyAdminRouter(): Router {
  const router = ExpressRouter();

  const adjust = { body: AdminPointsAdjustSchema };
  router.post('/points/adjust', validate(adjust), async (req, res) => {
    const { body } = valid(req, adjust);
    const { userId, ...result } = await service.adjust(body, adminActor(req));
    setAudit(res, 'points.adjust', userId);
    res.status(201);
    respond(res, AdminPointsAdjustResponseSchema, { data: result });
  });

  router.get('/rewards', async (_req, res) => {
    respond(res, AdminRewardListResponseSchema, { data: await rewards.listAdmin() });
  });
  const body = { body: AdminRewardInputSchema };
  router.post('/rewards', validate(body), async (req, res) => {
    const { body: input } = valid(req, body);
    const reward = await rewards.create(input);
    setAudit(res, 'reward.create', reward.id);
    res.status(201);
    respond(res, AdminRewardResponseSchema, { data: reward });
  });
  const update = { params: IdParamsSchema, body: AdminRewardInputSchema };
  router.put('/rewards/:id', validate(update), async (req, res) => {
    const { params, body: input } = valid(req, update);
    setAudit(res, 'reward.update', params.id);
    respond(res, AdminRewardResponseSchema, { data: await rewards.update(params.id, input) });
  });
  const byId = { params: IdParamsSchema };
  router.delete('/rewards/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'reward.delete', params.id);
    await rewards.remove(params.id);
    res.status(204).end();
  });

  return router;
}
