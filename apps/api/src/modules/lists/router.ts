import {
  CreateListSchema,
  ListDetailResponseSchema,
  ListItemParamsSchema,
  ListParamsSchema,
  ListsResponseSchema,
  ListToCartResponseSchema,
  PutListItemSchema,
  RenameListSchema,
  SetListItemQuantitySchema,
  ListSummarySchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';
import { z } from 'zod';

import { respond, valid, validate } from '../../lib/validate.ts';
import { requireUser } from '../../middleware/auth.ts';

import * as service from './service.ts';

// The signed-in shopper's named lists. The default list "Saved" is also the old wishlist (same
// rows, still served by /wishlist); every route here is scoped to the session's user id.
export function createListsRouter(): Router {
  const router = ExpressRouter();
  const userId = (req: { user: { id: string } | null }): string => {
    if (!req.user) throw new Error('requireUser let an anonymous request through');
    return req.user.id;
  };

  router.get('/me/lists', requireUser, async (req, res) => {
    respond(res, ListsResponseSchema, { data: await service.listsOf(userId(req)) });
  });

  const create = { body: CreateListSchema };
  router.post('/me/lists', requireUser, validate(create), async (req, res) => {
    const { body } = valid(req, create);
    res.status(201);
    respond(res, z.object({ data: ListSummarySchema }), {
      data: await service.createList(userId(req), body.name),
    });
  });

  const one = { params: ListParamsSchema };
  router.get('/me/lists/:id', requireUser, validate(one), async (req, res) => {
    const { params } = valid(req, one);
    respond(res, ListDetailResponseSchema, { data: await service.getList(userId(req), params.id) });
  });

  const rename = { params: ListParamsSchema, body: RenameListSchema };
  router.patch('/me/lists/:id', requireUser, validate(rename), async (req, res) => {
    const { params, body } = valid(req, rename);
    respond(res, z.object({ data: ListSummarySchema }), {
      data: await service.renameList(userId(req), params.id, body.name),
    });
  });

  router.delete('/me/lists/:id', requireUser, validate(one), async (req, res) => {
    const { params } = valid(req, one);
    await service.deleteList(userId(req), params.id);
    res.status(204).end();
  });

  const put = { params: ListParamsSchema, body: PutListItemSchema };
  router.put('/me/lists/:id/items', requireUser, validate(put), async (req, res) => {
    const { params, body } = valid(req, put);
    respond(res, ListDetailResponseSchema, {
      data: await service.putItem(userId(req), params.id, body),
    });
  });

  const qty = { params: ListItemParamsSchema, body: SetListItemQuantitySchema };
  router.patch('/me/lists/:id/items/:itemId', requireUser, validate(qty), async (req, res) => {
    const { params, body } = valid(req, qty);
    respond(res, ListDetailResponseSchema, {
      data: await service.setQuantity(userId(req), params.id, params.itemId, body.quantity),
    });
  });

  const item = { params: ListItemParamsSchema };
  router.delete('/me/lists/:id/items/:itemId', requireUser, validate(item), async (req, res) => {
    const { params } = valid(req, item);
    respond(res, ListDetailResponseSchema, {
      data: await service.removeItem(userId(req), params.id, params.itemId),
    });
  });

  router.post('/me/lists/:id/add-to-cart', requireUser, validate(one), async (req, res) => {
    const { params } = valid(req, one);
    respond(res, ListToCartResponseSchema, {
      data: await service.addAllToCart(userId(req), params.id),
    });
  });

  return router;
}
