import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '../config/env.ts';

// A link in an email that lets its reader act on ONE thing without signing in (accept or reject a
// swap). The token is an HMAC of "<purpose>:<subject id>" with COOKIE_SECRET: it names nothing the
// reader can edit (change the id and the signature no longer matches) and, being scoped by purpose,
// a token made for one use is useless for another. It carries no expiry on purpose: the action it
// allows ends by itself (a swap can only be answered while it is still proposed).
export function signToken(purpose: string, subjectId: string, secret = env.COOKIE_SECRET): string {
  return createHmac('sha256', secret).update(`${purpose}:${subjectId}`).digest('base64url');
}

export function verifyToken(
  purpose: string,
  subjectId: string,
  token: string,
  secret = env.COOKIE_SECRET,
): boolean {
  const expected = Buffer.from(signToken(purpose, subjectId, secret));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
