import { IdParamsSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';
import { z } from 'zod';

import { respond, valid, validate } from '../../lib/validate.ts';
import { setAudit } from '../admin/audit.ts';
import type { Outbox } from '../mail/outbox.ts';

import { notifyBuyers } from './service.ts';

const NotifyResponseSchema = z.object({
  data: z.object({ queued: z.number().int(), alreadyNotified: z.number().int() }),
});

export function createSafetyAdminRouter(deps: { outbox: Outbox }): Router {
  const router = ExpressRouter();

  const byId = { params: IdParamsSchema };
  router.post('/safety-notices/:id/notify', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'safety_notice.notify', params.id);
    respond(res, NotifyResponseSchema, { data: await notifyBuyers(params.id, deps) });
  });

  return router;
}
