import {
  AdminVetListQuerySchema,
  AdminVetListResponseSchema,
  AdminVetRejectSchema,
  AdminVetResponseSchema,
  OrderNumberParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import type { PaymentGateway } from '../../lib/stripe.ts';
import { respond, valid, validate } from '../../lib/validate.ts';
import { adminActor } from '../admin/actor.ts';
import { setAudit } from '../admin/audit.ts';
import type { Outbox } from '../mail/outbox.ts';
import type { ReturnsConfig } from '../returns/config.ts';

import * as service from './admin-service.ts';

export function createVetAdminRouter(deps: {
  payments: PaymentGateway;
  outbox: Outbox;
  returns: ReturnsConfig;
}): Router {
  const router = ExpressRouter();
  const ctx = (log: service.VetDeps['log']): service.VetDeps => ({
    gateway: deps.payments,
    log,
    returns: deps.returns,
  });

  const list = { query: AdminVetListQuerySchema };
  router.get('/vet-approvals', validate(list), async (req, res) => {
    const { query } = valid(req, list);
    respond(res, AdminVetListResponseSchema, await service.list(query, deps.returns));
  });

  const one = { params: OrderNumberParamsSchema };
  router.post('/vet-approvals/:number/approve', validate(one), async (req, res) => {
    const { params } = valid(req, one);
    setAudit(res, 'vet.approve', params.number);
    const data = await service.approve(ctx(req.log), params.number, adminActor(req));
    deps.outbox.kick();
    respond(res, AdminVetResponseSchema, { data });
  });

  const reject = { params: OrderNumberParamsSchema, body: AdminVetRejectSchema };
  router.post('/vet-approvals/:number/reject', validate(reject), async (req, res) => {
    const { params, body } = valid(req, reject);
    setAudit(res, 'vet.reject', params.number);
    const data = await service.reject(ctx(req.log), params.number, adminActor(req), body.reason);
    deps.outbox.kick();
    respond(res, AdminVetResponseSchema, { data });
  });

  return router;
}
