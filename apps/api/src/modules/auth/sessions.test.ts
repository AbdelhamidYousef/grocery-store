import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { sessions } from '../../db/schema/index.ts';
import { createUser } from '../../test/factories.ts';

import {
  SESSION_TTL_MS,
  SLIDE_INTERVAL_MS,
  createSession,
  deleteOtherSessions,
  deleteSession,
  getSession,
  hashToken,
  purgeExpired,
} from './sessions.ts';

const rowFor = async (token: string) =>
  (
    await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, hashToken(token)))
  )[0];

describe('sessions', () => {
  it('creates a random 32-byte token and stores only its SHA-256', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id, { ip: '1.2.3.4', userAgent: 'vitest' });

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const all = await db.select().from(sessions);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(hashToken(token));
    expect(all[0]?.id).not.toBe(token);
    expect(all[0]).toMatchObject({ ip: '1.2.3.4', userAgent: 'vitest' });
  });

  it('never issues the same token twice', async () => {
    const user = await createUser();
    const a = await createSession(user.id);
    const b = await createSession(user.id);
    expect(a.token).not.toBe(b.token);
  });

  it('loads the session with its user and no password hash', async () => {
    const user = await createUser({ role: 'admin' });
    const { token } = await createSession(user.id);

    const loaded = await getSession(token);
    expect(loaded?.user).toEqual({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: 'admin',
    });
    expect(JSON.stringify(loaded)).not.toContain('test-hash');
  });

  it('rejects junk, unknown and hash-as-token values', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    expect(await getSession('')).toBeNull();
    expect(await getSession('not-a-token')).toBeNull();
    expect(await getSession('A'.repeat(43))).toBeNull();
    // Possessing the stored hash must not be enough to act as the session.
    expect(await getSession(hashToken(token))).toBeNull();
  });

  it('rejects an expired session', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, hashToken(token)));
    expect(await getSession(token)).toBeNull();
  });

  it('does not slide a fresh session', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const before = (await rowFor(token))?.expiresAt;
    const loaded = await getSession(token);
    expect(loaded?.slid).toBe(false);
    expect((await rowFor(token))?.expiresAt).toEqual(before);
  });

  it('slides the expiry once the last slide is over an hour old', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    // Pretend the last slide happened two hours ago.
    const old = new Date(Date.now() + SESSION_TTL_MS - 2 * SLIDE_INTERVAL_MS);
    await db
      .update(sessions)
      .set({ expiresAt: old })
      .where(eq(sessions.id, hashToken(token)));

    const loaded = await getSession(token);
    expect(loaded?.slid).toBe(true);
    const after = (await rowFor(token))?.expiresAt;
    expect(after?.getTime()).toBeGreaterThan(old.getTime() + SLIDE_INTERVAL_MS);
    // And not again right away.
    expect((await getSession(token))?.slid).toBe(false);
  });

  it('deletes a session', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await deleteSession(token);
    expect(await getSession(token)).toBeNull();
  });

  it('deletes the other sessions of a user and keeps the given one and other users', async () => {
    const user = await createUser();
    const other = await createUser();
    const keep = await createSession(user.id);
    const drop = await createSession(user.id);
    const stranger = await createSession(other.id);

    await deleteOtherSessions(user.id, keep.token);

    expect(await getSession(keep.token)).not.toBeNull();
    expect(await getSession(drop.token)).toBeNull();
    expect(await getSession(stranger.token)).not.toBeNull();
  });

  it('purges only expired sessions', async () => {
    const user = await createUser();
    const live = await createSession(user.id);
    const dead = await createSession(user.id);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, hashToken(dead.token)));

    expect(await purgeExpired()).toBe(1);
    expect(await getSession(live.token)).not.toBeNull();
    expect(await rowFor(dead.token)).toBeUndefined();
  });
});
