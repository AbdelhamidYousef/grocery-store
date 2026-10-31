import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, lt, ne } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { sessions, users } from '../../db/schema/index.ts';

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
// Sliding expiry writes to the database; doing it on every request would turn each page view into
// an UPDATE. Once an hour keeps the session alive for active users at a negligible cost.
export const SLIDE_INTERVAL_MS = 3600 * 1000;

// The cookie carries a token; the database only ever holds its SHA-256. A leaked database (backup,
// SQL injection, a curious admin) therefore contains no usable session ids. The token is 256 bits
// of randomness, so a fast hash is enough: there is nothing to brute-force, unlike a password.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes in base64url, unpadded

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'customer' | 'admin';
}

// Header values are attacker-controlled and end up in our table: bound them.
const clip = (value: string | undefined) => value?.slice(0, 255) ?? null;

export async function createSession(
  userId: string,
  meta: SessionMeta = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: clip(meta.ip),
    userAgent: clip(meta.userAgent),
  });
  return { token, expiresAt };
}

export interface LoadedSession {
  user: AuthUser;
  expiresAt: Date;
  /** True when this call extended the session, so the caller can refresh the cookie's maxAge too. */
  slid: boolean;
}

// Returns null for anything that is not a live session: wrong shape, unknown, expired. The shape
// check avoids a database round trip for junk cookies.
export async function getSession(token: string): Promise<LoadedSession | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const id = hashToken(token);

  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      // Explicit columns: the password hash must never travel upward by accident.
      user: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    // Expiry is checked in the query so an expired row is never even returned.
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row) return null;

  // The remaining lifetime tells us when we last slid: it is below the full TTL by the time passed.
  const idleMs = SESSION_TTL_MS - (row.expiresAt.getTime() - Date.now());
  if (idleMs < SLIDE_INTERVAL_MS) return { user: row.user, expiresAt: row.expiresAt, slid: false };

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  return { user: row.user, expiresAt, slid: true };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

// Used after a password change: whoever else holds a session (possibly an attacker who knew the old
// password) is signed out, the device that made the change stays signed in.
export async function deleteOtherSessions(userId: string, keepToken: string): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, hashToken(keepToken))));
}

// Cron-less cleanup (free tier has no scheduler): every login deletes whatever has expired. The
// expires_at index makes it cheap.
export async function purgeExpired(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return deleted.length;
}
