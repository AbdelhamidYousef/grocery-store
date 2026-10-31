import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../db/client.ts';
import { sessions } from '../db/schema/index.ts';
import { createSession, hashToken, SESSION_TTL_MS } from '../modules/auth/sessions.ts';
import { createUser } from '../test/factories.ts';
import { bodyOf, errorOf } from '../test/http.ts';

import { attachUser, requireAdmin, requireUser } from './auth.ts';
import { createErrorHandler } from './error.ts';

// A tiny app: the middleware is tested on its own, before any real route uses it.
function makeApp() {
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: 'silent' }) }));
  app.use(cookieParser());
  app.use(attachUser);
  app.get('/who', (req, res) => {
    res.json({ user: req.user });
  });
  app.get('/private', requireUser, (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/admin', requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(createErrorHandler({ isProduction: false }));
  return app;
}

describe('attachUser', () => {
  it('sets req.user to null without a cookie', async () => {
    const res = await request(makeApp()).get('/who');
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toEqual({ user: null });
  });

  it('loads the user from a valid sid cookie', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const res = await request(makeApp()).get('/who').set('Cookie', `sid=${token}`);
    expect(bodyOf<{ user: { id: string } }>(res).user.id).toBe(user.id);
  });

  it('treats a bogus or unknown cookie as anonymous, not as an error', async () => {
    const app = makeApp();
    for (const value of ['garbage', 'A'.repeat(43)]) {
      const res = await request(app).get('/who').set('Cookie', `sid=${value}`);
      expect(res.status).toBe(200);
      expect(bodyOf(res)).toEqual({ user: null });
    }
  });

  it('treats an expired session as anonymous', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, hashToken(token)));
    const res = await request(makeApp()).get('/who').set('Cookie', `sid=${token}`);
    expect(bodyOf(res)).toEqual({ user: null });
  });

  it('refreshes the cookie when the session slides', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS - 2 * 3600 * 1000) })
      .where(eq(sessions.id, hashToken(token)));
    const res = await request(makeApp()).get('/who').set('Cookie', `sid=${token}`);
    expect(res.headers['set-cookie']?.[0]).toContain(`sid=${token}`);
  });

  it('does not touch the cookie when nothing slid', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const res = await request(makeApp()).get('/who').set('Cookie', `sid=${token}`);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('requireUser and requireAdmin', () => {
  it('answers 401 UNAUTHENTICATED when nobody is signed in', async () => {
    const app = makeApp();
    for (const path of ['/private', '/admin']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
      expect(errorOf(res).code).toBe('UNAUTHENTICATED');
    }
  });

  it('lets a customer through /private but answers 403 FORBIDDEN on /admin', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const app = makeApp();
    expect((await request(app).get('/private').set('Cookie', `sid=${token}`)).status).toBe(200);
    const res = await request(app).get('/admin').set('Cookie', `sid=${token}`);
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });

  it('lets an admin through /admin', async () => {
    const admin = await createUser({ role: 'admin' });
    const { token } = await createSession(admin.id);
    const res = await request(makeApp()).get('/admin').set('Cookie', `sid=${token}`);
    expect(res.status).toBe(200);
  });
});
