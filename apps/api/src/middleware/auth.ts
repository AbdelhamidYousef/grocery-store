import type { RequestHandler } from 'express';

import { readSessionCookie, setSessionCookie } from '../lib/cookies.ts';
import { forbidden, unauthenticated } from '../lib/errors.ts';
import { getSession, type AuthUser } from '../modules/auth/sessions.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the only way to extend Express's Request
  namespace Express {
    interface Request {
      /** Set by `attachUser` on every request that passes through it; null means anonymous. */
      user: AuthUser | null;
      /** The raw session cookie value of the current user (never logged, never stored as is). */
      sessionToken: string | null;
    }
  }
}

// Identifies the caller and never rejects: an anonymous visitor is a normal case, and each route
// decides whether it needs a user (`requireUser`). An invalid or expired cookie is treated exactly
// like no cookie. Real failures (the database being down) still propagate as a 500 rather than
// silently demoting a signed-in user to a guest.
export const attachUser: RequestHandler = async (req, res, next) => {
  req.user = null;
  req.sessionToken = null;

  const token = readSessionCookie(req);
  if (token) {
    const session = await getSession(token);
    if (session) {
      req.user = session.user;
      req.sessionToken = token;
      // The database expiry slid forward; move the browser's copy with it.
      if (session.slid) setSessionCookie(res, token);
    }
  }
  next();
};

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(unauthenticated());
    return;
  }
  next();
};

// 401 when nobody is signed in, 403 when someone is but is not an admin: the web client needs the
// difference to choose between "go to login" and "not allowed".
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(unauthenticated());
    return;
  }
  if (req.user.role !== 'admin') {
    next(forbidden('Admin access required'));
    return;
  }
  next();
};
