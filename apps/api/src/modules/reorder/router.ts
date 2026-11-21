import {
  BuyAgainResponseSchema,
  ReorderParamsSchema,
  ReorderResponseSchema,
  UsualsResponseSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { requireUser } from '../../middleware/auth.ts';

import * as service from './service.ts';

// The signed-in customer's shortcuts. Every query is scoped to the session's user id.
export function createReorderRouter(): Router {
  const router = ExpressRouter();
  const userId = (req: { user: { id: string } | null }): string => {
    if (!req.user) throw new Error('requireUser let an anonymous request through');
    return req.user.id;
  };

  router.get('/me/buy-again', requireUser, async (req, res) => {
    respond(res, BuyAgainResponseSchema, { data: await service.buyAgain(userId(req)) });
  });

  // "Your usuals" and the last basket, at the shopper's store (the X-Postcode header).
  router.get('/me/usuals', requireUser, async (req, res) => {
    respond(res, UsualsResponseSchema, { data: await service.usuals(userId(req)) });
  });

  const reorder = { params: ReorderParamsSchema };
  router.post('/me/orders/:id/reorder', requireUser, validate(reorder), async (req, res) => {
    const { params } = valid(req, reorder);
    respond(res, ReorderResponseSchema, { data: await service.reorder(userId(req), params.id) });
  });

  return router;
}
