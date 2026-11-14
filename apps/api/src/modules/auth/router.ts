import { LoginSchema, RegisterSchema, UserResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Request, type Response, type Router } from 'express';

import {
  clearCartCookie,
  clearSessionCookie,
  readGuestCartId,
  readSessionCookie,
  setSessionCookie,
} from '../../lib/cookies.ts';
import { respond, valid, validate } from '../../lib/validate.ts';
import { requireUser } from '../../middleware/auth.ts';
import { createAuthRateLimiter, type RateLimitOptions } from '../../middleware/rate-limit.ts';
import { mergeGuestCart } from '../cart/service.ts';
import { attachOnRegister } from '../loyalty/referrals-service.ts';

import * as service from './service.ts';

// The referral cookie (`pawsome_ref`, set by the web when someone arrives through a friend's link)
// is read once, when the account is created. Like the cart merge it must never fail a
// registration: an error is logged and the sign-up goes through.
async function attachReferral(
  req: Request,
  res: Response,
  user: { id: string; email: string },
): Promise<void> {
  const raw = (req.cookies as Record<string, unknown> | undefined)?.pawsome_ref;
  if (typeof raw !== 'string') return;
  try {
    await attachOnRegister(user, raw);
  } catch (err) {
    req.log.error({ err }, 'referral attach failed');
  }
  res.clearCookie('pawsome_ref', { path: '/' });
}

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });

// Runs after a successful login or registration, once the session cookie is set: the guest cart
// (if the browser carries a valid signed cookie) is merged into the account's cart. A merge
// failure must not fail the login, since the session already exists; the cookie is then kept so
// the next login retries, and the error is logged.
async function onLogin(userId: string, req: Request, res: Response): Promise<void> {
  const guestCartId = readGuestCartId(req);
  if (!guestCartId) return;
  try {
    await mergeGuestCart(guestCartId, userId);
    // Merged, or not a live guest cart any more: either way the cookie has no further use.
    clearCartCookie(res);
  } catch (err) {
    req.log.error({ err }, 'guest cart merge failed');
  }
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
    await attachReferral(req, res, user);
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
