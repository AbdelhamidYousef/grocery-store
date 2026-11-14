import { AdminPointsAdjustResponseSchema, AdminPointsAdjustSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { adminActor } from '../admin/actor.ts';
import { setAudit } from '../admin/audit.ts';

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

  return router;
}
