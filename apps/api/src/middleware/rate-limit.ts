import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { rateLimited } from '../lib/errors.ts';

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
}

// Rejections go through next(error) so the client gets the same JSON envelope (`RATE_LIMITED`)
// as every other failure instead of express-rate-limit's plain-text default.
function limiter(opts: RateLimitOptions, extra: Parameters<typeof rateLimit>[0] = {}) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(rateLimited()),
    ...extra,
  });
}

// Global limiter, keyed by client IP (the default). `trust proxy` is what makes req.ip the real
// client rather than Render's proxy: without it every visitor would share one bucket.
export function createRateLimiter(opts: RateLimitOptions): RequestHandler {
  return limiter(opts, {
    // Platform health probes must never be throttled into a false "down".
    skip: (req) => req.path === '/api/v1/health',
  });
}

// Stricter limiter for credential endpoints. Keyed by IP *and* the submitted email so one attacker
// cannot lock a victim out from everywhere, and one address cannot hammer many accounts cheaply.
// ipKeyGenerator groups IPv6 clients by /56 so rotating addresses inside one network does not
// dodge the limit.
export function createAuthRateLimiter(opts: RateLimitOptions): RequestHandler {
  return limiter(opts, {
    keyGenerator: (req) => {
      const body = req.body as { email?: unknown } | undefined;
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
    },
  });
}

// For public lookups and forms that need no login (order tracking, withdrawals, contact): keyed by
// client IP only, because there is no account to key on. With `trust proxy` set, that IP is the
// real visitor's.
export function createIpRateLimiter(opts: RateLimitOptions): RequestHandler {
  return limiter(opts);
}

// For actions of a signed-in user (reviews, votes): keyed by account, so one person cannot dodge
// the limit by changing IP and a shared office IP does not throttle colleagues. Mount it after
// `requireUser`; an anonymous request falls back to its IP.
export function createUserRateLimiter(opts: RateLimitOptions): RequestHandler {
  return limiter(opts, {
    keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  });
}
