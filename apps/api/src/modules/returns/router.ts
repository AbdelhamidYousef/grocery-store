import {
  OrderNumberParamsSchema,
  OrderReturnsResponseSchema,
  ReturnRequestBodySchema,
  ReturnResponseSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { requireUser } from '../../middleware/auth.ts';
import type { Outbox } from '../mail/outbox.ts';

import type { ReturnsConfig } from './config.ts';
import * as service from './service.ts';

export function createReturnsRouter(deps: { outbox: Outbox; returns: ReturnsConfig }): Router {
  const router = ExpressRouter();

  // Owner only: every handler scopes to `req.user.id`, never to an id from the request.
  router.use('/orders', requireUser);
  const userId = (req: { user: { id: string } | null }): string => {
    if (!req.user) throw new Error('requireUser let an anonymous request through');
    return req.user.id;
  };

  const byNumber = { params: OrderNumberParamsSchema };
  router.get('/orders/:number/returns', validate(byNumber), async (req, res) => {
    const { params } = valid(req, byNumber);
    respond(res, OrderReturnsResponseSchema, {
      data: await service.listForOrder(userId(req), params.number, deps.returns),
    });
  });

  const create = { params: OrderNumberParamsSchema, body: ReturnRequestBodySchema };
  router.post('/orders/:number/returns', validate(create), async (req, res) => {
    const { params, body } = valid(req, create);
    const created = await service.requestReturn(userId(req), params.number, body, deps.returns);
    deps.outbox.kick();
    res.status(201);
    respond(res, ReturnResponseSchema, { data: created });
  });

  return router;
}
