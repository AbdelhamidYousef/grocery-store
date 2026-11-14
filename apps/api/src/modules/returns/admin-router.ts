import {
  AdminReturnDetailResponseSchema,
  AdminReturnListQuerySchema,
  AdminReturnListResponseSchema,
  AdminReturnReceiveSchema,
  AdminReturnRefundSchema,
  AdminReturnRejectSchema,
  ReturnIdParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import type { PaymentGateway } from '../../lib/stripe.ts';
import { respond, valid, validate } from '../../lib/validate.ts';
import { adminActor } from '../admin/actor.ts';
import { setAudit } from '../admin/audit.ts';
import type { Outbox } from '../mail/outbox.ts';

import * as service from './admin-service.ts';
import type { ReturnsConfig } from './config.ts';

export function createReturnsAdminRouter(deps: {
  payments: PaymentGateway;
  outbox: Outbox;
  returns: ReturnsConfig;
}): Router {
  const router = ExpressRouter();
  const ctx = (log: service.AdminReturnDeps['log']): service.AdminReturnDeps => ({
    gateway: deps.payments,
    log,
    returns: deps.returns,
  });

  const list = { query: AdminReturnListQuerySchema };
  router.get('/returns', validate(list), async (req, res) => {
    const { query } = valid(req, list);
    respond(res, AdminReturnListResponseSchema, await service.listReturns(query));
  });

  const one = { params: ReturnIdParamsSchema };
  router.get('/returns/:id', validate(one), async (req, res) => {
    const { params } = valid(req, one);
    respond(res, AdminReturnDetailResponseSchema, {
      data: await service.getReturnDetail(params.id, deps.returns),
    });
  });

  router.post('/returns/:id/approve', validate(one), async (req, res) => {
    const { params } = valid(req, one);
    setAudit(res, 'return.approve', params.id);
    const data = await service.approve(ctx(req.log), params.id, adminActor(req));
    deps.outbox.kick();
    respond(res, AdminReturnDetailResponseSchema, { data });
  });

  const reject = { params: ReturnIdParamsSchema, body: AdminReturnRejectSchema };
  router.post('/returns/:id/reject', validate(reject), async (req, res) => {
    const { params, body } = valid(req, reject);
    setAudit(res, 'return.reject', params.id);
    const data = await service.reject(ctx(req.log), params.id, adminActor(req), body.reason);
    deps.outbox.kick();
    respond(res, AdminReturnDetailResponseSchema, { data });
  });

  const receive = { params: ReturnIdParamsSchema, body: AdminReturnReceiveSchema };
  router.post('/returns/:id/receive', validate(receive), async (req, res) => {
    const { params, body } = valid(req, receive);
    setAudit(res, 'return.receive', params.id);
    const data = await service.receive(
      ctx(req.log),
      params.id,
      adminActor(req),
      body.restockItemIds,
    );
    deps.outbox.kick();
    respond(res, AdminReturnDetailResponseSchema, { data });
  });

  const refund = { params: ReturnIdParamsSchema, body: AdminReturnRefundSchema };
  router.post('/returns/:id/refund', validate(refund), async (req, res) => {
    const { params, body } = valid(req, refund);
    setAudit(res, 'return.refund', params.id);
    const data = await service.refund(ctx(req.log), params.id, adminActor(req), {
      refundShipping: body.refundShipping,
    });
    deps.outbox.kick();
    respond(res, AdminReturnDetailResponseSchema, { data });
  });

  return router;
}
