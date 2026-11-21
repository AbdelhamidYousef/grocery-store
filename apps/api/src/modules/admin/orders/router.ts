import {
  AdminCaptureSchema,
  AdminDoorResponseSchema,
  AdminShortfallParamsSchema,
  AdminShortfallResponseSchema,
  AdminShortfallSchema,
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
import type { ReturnsConfig } from '../../returns/config.ts';
import { rejectAtDoor } from '../../substitutions/door.ts';
import { recordShortfall } from '../../substitutions/swaps.ts';
import { adminActor } from '../actor.ts';
import { setAudit } from '../audit.ts';

import * as service from './service.ts';

export function createAdminOrdersRouter(deps: {
  payments: PaymentGateway;
  outbox: Outbox;
  returns: ReturnsConfig;
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

  // The packer found fewer than ordered (the G8 packer view calls the same service). Records it, adds
  // the replacement the shopper's preference allows and queues "we changed something in your order".
  const shortfall = { params: AdminShortfallParamsSchema, body: AdminShortfallSchema };
  router.post('/orders/:number/items/:itemId/shortfall', validate(shortfall), async (req, res) => {
    const { params, body } = valid(req, shortfall);
    setAudit(res, 'order.shortfall', params.number);
    const result = await recordShortfall(params.itemId, body, adminActor(req), params.number);
    deps.outbox.kick();
    respond(res, AdminShortfallResponseSchema, { data: result });
  });

  // A replacement refused at the door after the money was taken: refunds exactly that line.
  const door = { params: AdminShortfallParamsSchema };
  router.post('/orders/:number/swaps/:itemId/reject-at-door', validate(door), async (req, res) => {
    const { params } = valid(req, door);
    setAudit(res, 'order.swap.reject-at-door', params.number);
    const result = await rejectAtDoor(
      { gateway: deps.payments, log: req.log, simulated: deps.returns.simulated },
      params.number,
      params.itemId,
      adminActor(req),
    );
    respond(res, AdminDoorResponseSchema, { data: result });
  });

  const customers = { query: AdminCustomerListQuerySchema };
  router.get('/customers', validate(customers), async (req, res) => {
    const { query } = valid(req, customers);
    respond(res, AdminCustomerListResponseSchema, await service.listCustomers(query));
  });

  return router;
}
