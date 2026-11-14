import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { sessions, users } from '../../db/schema/index.ts';
import { makeTestApp, TEST_ORIGIN } from '../../test/app.ts';
import { createUser } from '../../test/factories.ts';
import { bodyOf, cookieValue, errorOf, setCookieLine } from '../../test/http.ts';

import { hash } from './password.ts';
import { createSession, hashToken } from './sessions.ts';

const PASSWORD = 'correct horse battery staple';
const registration = {
  email: 'Ada@grocery.test',
  password: PASSWORD,
  firstName: 'Ada',
  lastName: 'Lovelace',
};

const app = makeTestApp();
const post = (path: string, body: object, cookie?: string, origin: string = TEST_ORIGIN) => {
  const req = request(app).post(path).set('Origin', origin).send(body);
  return cookie ? req.set('Cookie', `sid=${cookie}`) : req;
};
const me = (cookie?: string) => {
  const req = request(app).get('/api/v1/auth/me');
  return cookie ? req.set('Cookie', `sid=${cookie}`) : req;
};

describe('POST /auth/register', () => {
  it('creates the account, signs in and returns the user without any hash', async () => {
    const res = await post('/api/v1/auth/register', registration);

    expect(res.status).toBe(201);
    expect(bodyOf(res)).toEqual({
      data: {
        user: {
          id: expect.any(String) as string,
          email: 'ada@grocery.test',
          firstName: 'Ada',
          lastName: 'Lovelace',
          role: 'customer',
        },
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash|password_hash/);

    const [row] = await db.select().from(users);
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row?.passwordHash).not.toContain(PASSWORD);
  });

  it('sets a hardened sid cookie and stores only its hash', async () => {
    const res = await post('/api/v1/auth/register', registration);
    const line = setCookieLine(res, 'sid') ?? '';
    const token = cookieValue(res, 'sid') ?? '';

    expect(line).toContain('HttpOnly');
    expect(line).toContain('SameSite=Lax');
    expect(line).toContain('Path=/');
    expect(line).not.toContain('Secure'); // plain http in tests
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const rows = await db.select().from(sessions);
    expect(rows.map((r) => r.id)).toEqual([hashToken(token)]);
    expect((await me(token)).status).toBe(200);
  });

  it('marks the cookie Secure in production', async () => {
    const prod = makeTestApp({ config: { nodeEnv: 'production' } });
    const res = await request(prod)
      .post('/api/v1/auth/register')
      .set('Origin', TEST_ORIGIN)
      .send(registration);
    expect(setCookieLine(res, 'sid')).toContain('Secure');
  });

  it('answers 409 CONFLICT for an email that exists, whatever its case', async () => {
    await post('/api/v1/auth/register', registration);
    const res = await post('/api/v1/auth/register', {
      ...registration,
      email: 'ADA@grocery.test',
    });
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('CONFLICT');
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it.each([
    ['a short password', { password: 'short-pw' }, 'password'],
    ['a common password', { password: 'Password123' }, 'password'],
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['a blank name', { firstName: '   ' }, 'firstName'],
  ])('rejects %s with VALIDATION_ERROR', async (_label, patch, field) => {
    const res = await post('/api/v1/auth/register', { ...registration, ...patch });
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(errorOf(res).details)).toContain(field);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('refuses a cross-origin request and creates nothing', async () => {
    const res = await post('/api/v1/auth/register', registration, undefined, 'https://evil.test');
    expect(res.status).toBe(403);
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe('POST /auth/login', () => {
  async function seedUser() {
    return createUser({ email: 'sam@grocery.test', passwordHash: await hash(PASSWORD) });
  }

  it('signs in with the right password and sets a new session cookie', async () => {
    const user = await seedUser();
    const res = await post('/api/v1/auth/login', { email: 'SAM@grocery.test', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(bodyOf<{ data: { user: { id: string } } }>(res).data.user.id).toBe(user.id);
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/);
    const token = cookieValue(res, 'sid') ?? '';
    expect((await me(token)).status).toBe(200);
  });

  it('gives the same generic answer for a wrong password and an unknown email', async () => {
    await seedUser();
    const wrong = await post('/api/v1/auth/login', { email: 'sam@grocery.test', password: 'nope' });
    const unknown = await post('/api/v1/auth/login', {
      email: 'who@grocery.test',
      password: 'nope',
    });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(errorOf(wrong)).toEqual(errorOf(unknown));
    expect(errorOf(wrong).code).toBe('UNAUTHENTICATED');
    expect(setCookieLine(wrong, 'sid')).toBeUndefined();
    expect(setCookieLine(unknown, 'sid')).toBeUndefined();
  });

  it('spends a real password hash on an unknown email (no fast path to probe)', async () => {
    await seedUser();
    // Warm the cached dummy hash so only the verification itself is measured.
    await post('/api/v1/auth/login', { email: 'warm@grocery.test', password: 'x' });
    const started = performance.now();
    await post('/api/v1/auth/login', { email: 'who@grocery.test', password: 'nope' });
    // An argon2 verify at 64 MiB / 3 passes takes tens of ms; a skipped one takes about 2.
    expect(performance.now() - started).toBeGreaterThan(20);
  });

  it('issues a new session id on login and destroys the one that arrived (fixation)', async () => {
    const user = await seedUser();
    const planted = await createSession(user.id);

    const res = await post(
      '/api/v1/auth/login',
      { email: 'sam@grocery.test', password: PASSWORD },
      planted.token,
    );
    const fresh = cookieValue(res, 'sid') ?? '';

    expect(fresh).not.toBe(planted.token);
    expect((await me(planted.token)).status).toBe(401);
    expect((await me(fresh)).status).toBe(200);
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it('also destroys a session that belonged to somebody else', async () => {
    await seedUser();
    const other = await createUser();
    const theirs = await createSession(other.id);
    await post(
      '/api/v1/auth/login',
      { email: 'sam@grocery.test', password: PASSWORD },
      theirs.token,
    );
    expect((await me(theirs.token)).status).toBe(401);
  });

  it('purges expired sessions of anyone on login', async () => {
    await seedUser();
    const other = await createUser();
    const dead = await createSession(other.id);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, hashToken(dead.token)));
    await post('/api/v1/auth/login', { email: 'sam@grocery.test', password: PASSWORD });
    const ids = (await db.select().from(sessions)).map((r) => r.id);
    expect(ids).not.toContain(hashToken(dead.token));
  });

  it('rate-limits repeated attempts per IP and email with RATE_LIMITED', async () => {
    await seedUser();
    const limited = makeTestApp({ config: { authRateLimit: { windowMs: 60_000, limit: 3 } } });
    const attempt = (email: string) =>
      request(limited)
        .post('/api/v1/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ email, password: 'wrong' });

    for (let i = 0; i < 3; i++) expect((await attempt('sam@grocery.test')).status).toBe(401);
    const blocked = await attempt('sam@grocery.test');
    expect(blocked.status).toBe(429);
    expect(errorOf(blocked).code).toBe('RATE_LIMITED');
    // The key includes the email, so another account from the same IP still gets its own budget.
    expect((await attempt('other@grocery.test')).status).toBe(401);
    // And the key ignores case and padding, so retyping the email cannot dodge the limit.
    expect((await attempt('  SAM@grocery.test ')).status).toBe(429);
  });

  it('rejects a body without a password with VALIDATION_ERROR', async () => {
    const res = await post('/api/v1/auth/login', { email: 'sam@grocery.test' });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/logout and GET /auth/me', () => {
  it('returns 401 UNAUTHENTICATED from /auth/me without a session', async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('runs the whole flow: register, me, logout, me, login', async () => {
    const reg = await post('/api/v1/auth/register', registration);
    const token = cookieValue(reg, 'sid') ?? '';
    expect((await me(token)).status).toBe(200);

    const out = await post('/api/v1/auth/logout', {}, token);
    expect(out.status).toBe(204);
    expect(setCookieLine(out, 'sid')).toMatch(/^sid=;.*Expires=Thu, 01 Jan 1970/);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect((await me(token)).status).toBe(401);

    const back = await post('/api/v1/auth/login', {
      email: registration.email,
      password: PASSWORD,
    });
    expect(back.status).toBe(200);
  });

  it('logs out only the current session', async () => {
    const user = await createUser();
    const a = await createSession(user.id);
    const b = await createSession(user.id);
    await post('/api/v1/auth/logout', {}, a.token);
    expect((await me(a.token)).status).toBe(401);
    expect((await me(b.token)).status).toBe(200);
  });

  it('is idempotent: logging out without a session still succeeds and clears the cookie', async () => {
    const res = await post('/api/v1/auth/logout', {});
    expect(res.status).toBe(204);
    expect(setCookieLine(res, 'sid')).toBeDefined();
  });
});
