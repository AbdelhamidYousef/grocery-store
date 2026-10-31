import { LoginSchema, RegisterSchema, UserResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Request, type Response, type Router } from 'express';

import { clearSessionCookie, readSessionCookie, setSessionCookie } from '../../lib/cookies.ts';
import { respond, valid, validate } from '../../lib/validate.ts';
import { requireUser } from '../../middleware/auth.ts';
import { createAuthRateLimiter, type RateLimitOptions } from '../../middleware/rate-limit.ts';

import * as service from './service.ts';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });

// Runs after a successful login or registration, once the session cookie is set.
// TODO(7.4): call cartService.mergeGuestCart(guestCartId, userId) here and clear the cart_id cookie.
async function onLogin(_userId: string, _req: Request, _res: Response): Promise<void> {
  await Promise.resolve();
}

export function createAuthRouter(opts: { authRateLimit: RateLimitOptions }): Router {
  const router = ExpressRouter();
  // Before validation on purpose: malformed attempts count against the limit too.
  const credentialLimit = createAuthRateLimiter(opts.authRateLimit);

  const register = { body: RegisterSchema };
  router.post('/auth/register', credentialLimit, validate(register), async (req, res) => {
    const { body } = valid(req, register);
    // The cookie we read is the one we replace: it is the old session to destroy (fixation).
    const { user, token } = await service.register(body, meta(req), readSessionCookie(req));
    setSessionCookie(res, token);
    await onLogin(user.id, req, res);
    res.status(201);
    respond(res, UserResponseSchema, { data: { user } });
  });

  const login = { body: LoginSchema };
  router.post('/auth/login', credentialLimit, validate(login), async (req, res) => {
    const { body } = valid(req, login);
    const { user, token } = await service.login(body, meta(req), readSessionCookie(req));
    setSessionCookie(res, token);
    await onLogin(user.id, req, res);
    respond(res, UserResponseSchema, { data: { user } });
  });

  // Idempotent on purpose (no requireUser): a visitor whose session already expired still wants the
  // cookie gone and a success answer, and signing out twice must not be an error.
  router.post('/auth/logout', async (req, res) => {
    await service.logout(req.sessionToken);
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.get('/auth/me', requireUser, (req, res) => {
    // requireUser guarantees a user; the check narrows the type without a non-null assertion.
    if (!req.user) throw new Error('requireUser let an anonymous request through');
    respond(res, UserResponseSchema, { data: { user: req.user } });
  });

  return router;
}
