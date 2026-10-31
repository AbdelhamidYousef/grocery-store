import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { conflict, forbidden, notFound, unauthenticated, validation } from '../lib/errors.ts';
import { makeTestApp, TEST_ORIGIN } from '../test/app.ts';
import { bodyOf, errorOf } from '../test/http.ts';

import { createErrorHandler, notFoundHandler } from './error.ts';

// A tiny app whose routes just throw what each test needs; the real middleware under test is
// mounted exactly as createApp mounts it.
function appThatThrows(thrown: () => unknown, isProduction = false) {
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: 'silent' }) }));
  app.get('/boom', () => {
    throw thrown();
  });
  app.use(notFoundHandler);
  app.use(createErrorHandler({ isProduction }));
  return app;
}

describe('error middleware', () => {
  it.each([
    ['notFound', () => notFound('nope'), 404, 'NOT_FOUND'],
    ['unauthenticated', () => unauthenticated(), 401, 'UNAUTHENTICATED'],
    ['forbidden', () => forbidden(), 403, 'FORBIDDEN'],
    ['validation', () => validation({ field: 'bad' }), 400, 'VALIDATION_ERROR'],
    ['conflict', () => conflict(), 409, 'CONFLICT'],
    ['out of stock', () => conflict('OUT_OF_STOCK'), 409, 'OUT_OF_STOCK'],
  ])('maps %s to its status and code', async (_name, make, status, code) => {
    const res = await request(appThatThrows(make)).get('/boom');
    expect(res.status).toBe(status);
    expect(errorOf(res).code).toBe(code);
    expect(typeof errorOf(res).message).toBe('string');
  });

  it('includes details only when the error has some', async () => {
    const withDetails = await request(appThatThrows(() => validation({ a: 1 }))).get('/boom');
    expect(errorOf(withDetails).details).toEqual({ a: 1 });
    const without = await request(appThatThrows(() => notFound())).get('/boom');
    expect(errorOf(without)).not.toHaveProperty('details');
  });

  it('maps a ZodError to 400 with flattened issues', async () => {
    const res = await request(
      appThatThrows(() => z.object({ name: z.string() }).parse({ name: 3 })),
    ).get('/boom');
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    expect(
      (errorOf(res).details as { fieldErrors: { name: string[] } }).fieldErrors.name,
    ).toHaveLength(1);
  });

  it('maps an unknown error to 500 and shows its message outside production', async () => {
    const res = await request(appThatThrows(() => new Error('db exploded'))).get('/boom');
    expect(res.status).toBe(500);
    expect(errorOf(res)).toMatchObject({ code: 'INTERNAL', message: 'db exploded' });
  });

  it('hides the message and any stack in production', async () => {
    const res = await request(appThatThrows(() => new Error('db exploded'), true)).get('/boom');
    expect(res.status).toBe(500);
    expect(errorOf(res).message).toBe('Internal server error');
    expect(JSON.stringify(bodyOf(res))).not.toMatch(/db exploded|at .*\.ts/);
  });

  it('does not throw on non-Error throwables', async () => {
    const res = await request(appThatThrows(() => 'a string', true)).get('/boom');
    expect(res.status).toBe(500);
  });

  it('answers unknown routes with a JSON 404', async () => {
    const res = await request(appThatThrows(() => notFound())).get('/nothing-here');
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });
});

describe('error handling in the real app', () => {
  const app = makeTestApp();

  it('answers a malformed JSON body with 400 and VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
  });

  it('answers an unknown route with 404 and the error envelope', async () => {
    const res = await request(app).get('/api/v1/no-such-thing');
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });
});
