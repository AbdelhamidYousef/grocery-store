import {
  AddressInputSchema,
  AddressListResponseSchema,
  AddressResponseSchema,
  AddressUpdateSchema,
  ChangePasswordSchema,
  IdParamsSchema,
  OrderListResponseSchema,
  PaginationQuerySchema,
  ProfileResponseSchema,
  UpdateProfileSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { requireUser } from '../../middleware/auth.ts';
import { createAuthRateLimiter, type RateLimitOptions } from '../../middleware/rate-limit.ts';

import * as service from './service.ts';

export function createAccountRouter(opts: { authRateLimit: RateLimitOptions }): Router {
  const router = ExpressRouter();

  // Every /account route needs a signed-in user, and every handler below scopes its queries to
  // `req.user.id`, never to an id from the request.
  router.use('/account', requireUser);

  // `req.user` is non-null after requireUser; this narrows it without `!`.
  const userId = (req: { user: { id: string } | null }): string => {
    if (!req.user) throw new Error('requireUser let an anonymous request through');
    return req.user.id;
  };

  const profile = { body: UpdateProfileSchema };
  router.patch('/account', validate(profile), async (req, res) => {
    const { body } = valid(req, profile);
    respond(res, ProfileResponseSchema, {
      data: { user: await service.updateProfile(userId(req), body) },
    });
  });

  // Verifying the current password is an oracle for an attacker holding a stolen session, so it
  // shares the credential rate limit.
  const password = { body: ChangePasswordSchema };
  router.post(
    '/account/password',
    createAuthRateLimiter(opts.authRateLimit),
    validate(password),
    async (req, res) => {
      const { body } = valid(req, password);
      if (!req.sessionToken) throw new Error('requireUser let an anonymous request through');
      await service.changePassword(userId(req), body, req.sessionToken);
      res.status(204).end();
    },
  );

  router.get('/account/addresses', async (req, res) => {
    respond(res, AddressListResponseSchema, { data: await service.listAddresses(userId(req)) });
  });

  const create = { body: AddressInputSchema };
  router.post('/account/addresses', validate(create), async (req, res) => {
    const { body } = valid(req, create);
    res.status(201);
    respond(res, AddressResponseSchema, { data: await service.createAddress(userId(req), body) });
  });

  const update = { params: IdParamsSchema, body: AddressUpdateSchema };
  router.patch('/account/addresses/:id', validate(update), async (req, res) => {
    const { params, body } = valid(req, update);
    respond(res, AddressResponseSchema, {
      data: await service.updateAddress(userId(req), params.id, body),
    });
  });

  const byId = { params: IdParamsSchema };
  router.delete('/account/addresses/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    await service.deleteAddress(userId(req), params.id);
    res.status(204).end();
  });

  // Placeholder: phase 9 creates orders, so for now this is an empty (but real, paginated) list.
  const list = { query: PaginationQuerySchema };
  router.get('/account/orders', validate(list), async (req, res) => {
    const { query } = valid(req, list);
    respond(
      res,
      OrderListResponseSchema,
      await service.listOrders(userId(req), query.page, query.limit),
    );
  });

  return router;
}
