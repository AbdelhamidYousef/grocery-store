import {
  SharedWishlistParamsSchema,
  SharedWishlistResponseSchema,
  WishlistAddSchema,
  WishlistItemParamsSchema,
  WishlistResponseSchema,
} from '@store/shared';
import type { Request } from 'express';
import { Router as ExpressRouter, type Router } from 'express';

import { readGuestWishlistId, setWishlistCookie } from '../../lib/cookies.ts';
import { unauthenticated } from '../../lib/errors.ts';
import { respond, valid, validate } from '../../lib/validate.ts';

import * as service from './service.ts';

const whoIs = (req: Request): service.WishlistWho => ({
  userId: req.user?.id ?? null,
  guestWishlistId: readGuestWishlistId(req),
});

// Mounted after `attachUser` and `noStore`: the answer depends on who asks. A read never creates a
// list (bots would fill the table); the first add does, and sets the guest cookie.
export function createWishlistRouter(): Router {
  const router = ExpressRouter();

  router.get('/wishlist', async (req, res) => {
    respond(res, WishlistResponseSchema, { data: await service.getWishlist(whoIs(req)) });
  });

  const add = { body: WishlistAddSchema };
  router.post('/wishlist/items', validate(add), async (req, res) => {
    const { body } = valid(req, add);
    const { wishlist, createdGuestListId } = await service.addItem(whoIs(req), body);
    if (createdGuestListId) setWishlistCookie(res, createdGuestListId);
    respond(res, WishlistResponseSchema, { data: wishlist });
  });

  const byId = { params: WishlistItemParamsSchema };
  router.delete('/wishlist/items/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    respond(res, WishlistResponseSchema, {
      data: await service.removeItem(whoIs(req), params.id),
    });
  });

  const needUser = (req: Request): string => {
    if (!req.user) throw unauthenticated('Sign in to share your wishlist');
    return req.user.id;
  };
  router.post('/wishlist/share', async (req, res) => {
    respond(res, WishlistResponseSchema, { data: await service.setSharing(needUser(req), true) });
  });
  router.delete('/wishlist/share', async (req, res) => {
    respond(res, WishlistResponseSchema, { data: await service.setSharing(needUser(req), false) });
  });

  const shared = { params: SharedWishlistParamsSchema };
  router.get('/wishlist/shared/:token', validate(shared), async (req, res) => {
    const { params } = valid(req, shared);
    respond(res, SharedWishlistResponseSchema, { data: await service.getShared(params.token) });
  });

  return router;
}
