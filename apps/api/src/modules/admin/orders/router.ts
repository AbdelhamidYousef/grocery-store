import {
  AdminCaptureSchema,
  AdminCustomerListQuerySchema,
  AdminCustomerListResponseSchema,
  AdminOrderDetailResponseSchema,
  AdminOrderListQuerySchema,
  AdminOrderListResponseSchema,
  AdminTransitionSchema,
  OrderNumberParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import type { PaymentGateway } from '../../../lib/stripe.ts';
import { respond, valid, validate } from '../../../lib/validate.ts';
import type { Outbox } from '../../mail/outbox.ts';
import { adminActor } from '../actor.ts';
import { setAudit } from '../audit.ts';

import * as service from './service.ts';

export function createAdminOrdersRouter(deps: {
  payments: PaymentGateway;
  outbox: Outbox;
}): Router {
  const router = ExpressRouter();

  const list = { query: AdminOrderListQuerySchema };
  router.get('/orders', validate(list), async (req, res) => {
    const { query } = valid(req, list);
    respond(res, AdminOrderListResponseSchema, await service.listOrders(query));
  });

  const byNumber = { params: OrderNumberParamsSchema };
  router.get('/orders/:number', validate(byNumber), async (req, res) => {
    const { params } = valid(req, byNumber);
    respond(res, AdminOrderDetailResponseSchema, {
      data: await service.getOrderDetail(params.number),
    });
  });

  const move = { params: OrderNumberParamsSchema, body: AdminTransitionSchema };
  router.post('/orders/:number/transition', validate(move), async (req, res) => {
    const { params, body } = valid(req, move);
    setAudit(res, `order.transition.${body.to}`, params.number);
    const detail = await service.transition(
      { gateway: deps.payments, log: req.log },
      params.number,
      body.to,
      adminActor(req),
      body.note,
    );
    // The shipped email (if any) was queued by the transition; send it now, best effort.
    deps.outbox.kick();
    respond(res, AdminOrderDetailResponseSchema, { data: detail });
  });

  // Takes the money of an authorised order now (picking will do it in G8). The amount is worked out
  // from the order, never read from the request.
  const capture = { params: OrderNumberParamsSchema, body: AdminCaptureSchema };
  router.post('/orders/:number/capture', validate(capture), async (req, res) => {
    const { params, body } = valid(req, capture);
    setAudit(res, 'order.capture', params.number);
    const detail = await service.capture(
      { gateway: deps.payments, log: req.log },
      params.number,
      adminActor(req),
      body.weights,
    );
    deps.outbox.kick();
    respond(res, AdminOrderDetailResponseSchema, { data: detail });
  });

  const customers = { query: AdminCustomerListQuerySchema };
  router.get('/customers', validate(customers), async (req, res) => {
    const { query } = valid(req, customers);
    respond(res, AdminCustomerListResponseSchema, await service.listCustomers(query));
  });

  return router;
}
