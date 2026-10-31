import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp, TEST_ORIGIN } from '../test/app.ts';
import { bodyOf, errorOf } from '../test/http.ts';

import { createAuthRateLimiter } from './rate-limit.ts';

describe('security headers', () => {
  it('sets helmet headers and hides x-powered-by', async () => {
    const res = await request(makeTestApp()).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});

describe('CORS', () => {
  it('answers a preflight from the web origin with credentials allowed', async () => {
    const res = await request(makeTestApp())
      .options('/api/v1/cart/items')
      .set('Origin', TEST_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant a foreign origin access', async () => {
    const res = await request(makeTestApp())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('CSRF origin check', () => {
  const app = makeTestApp();

  it('blocks a mutating request from a foreign origin with 403', async () => {
    const res = await request(app).post('/api/v1/anything').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });

  it('blocks a mutating request with neither Origin nor Referer', async () => {
    const res = await request(app).post('/api/v1/anything');
    expect(res.status).toBe(403);
  });

  it('accepts a matching Origin (then 404s, since the route does not exist)', async () => {
    const res = await request(app).post('/api/v1/anything').set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(404);
  });

  it('falls back to Referer when Origin is absent', async () => {
    const ok = await request(app).post('/api/v1/anything').set('Referer', `${TEST_ORIGIN}/cart`);
    expect(ok.status).toBe(404);
    const bad = await request(app)
      .post('/api/v1/anything')
      .set('Referer', 'https://evil.example/cart');
    expect(bad.status).toBe(403);
  });

  it('never checks safe methods', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(res.status).toBe(200);
  });

  it('exempts the Stripe webhook path', async () => {
    // No Origin and no signature: the route itself refuses (400), but the CSRF check (403) never
    // sees it. Before the webhook existed this was a 404.
    const res = await request(app).post('/api/v1/webhooks/stripe');
    expect(res.status).toBe(400);
  });
});

describe('body size limit', () => {
  it('rejects a body above 100 kB with 413', async () => {
    const res = await request(makeTestApp())
      .post('/api/v1/anything')
      .set('Origin', TEST_ORIGIN)
      .send({ blob: 'x'.repeat(110_000) });
    expect(res.status).toBe(413);
  });
});

describe('rate limiting', () => {
  it('answers with 429 RATE_LIMITED after the limit and keeps health reachable', async () => {
    const app = makeTestApp({ config: { rateLimit: { windowMs: 60_000, limit: 2 } } });
    await request(app).get('/api/v1/nothing');
    await request(app).get('/api/v1/nothing');
    const res = await request(app).get('/api/v1/nothing');
    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe('RATE_LIMITED');
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
  });

  it('keys the auth limiter by email as well as IP', async () => {
    const app = express();
    app.use(express.json());
    app.post('/login', createAuthRateLimiter({ windowMs: 60_000, limit: 1 }), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(
      (
        _err: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(429).json({ limited: true });
      },
    );

    const a1 = await request(app).post('/login').send({ email: 'a@x.com' });
    const a2 = await request(app).post('/login').send({ email: 'A@x.com ' });
    const b1 = await request(app).post('/login').send({ email: 'b@x.com' });
    expect(a1.status).toBe(200);
    expect(bodyOf(a2)).toEqual({ limited: true });
    expect(b1.status).toBe(200);
  });
});
