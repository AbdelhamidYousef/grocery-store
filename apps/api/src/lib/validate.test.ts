import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createErrorHandler } from '../middleware/error.ts';
import { bodyOf, errorOf } from '../test/http.ts';

import { respond, valid, validate } from './validate.ts';

const schemas = {
  params: z.object({ id: z.string().min(2) }),
  query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
  body: z.object({ name: z.string().min(1) }),
};

const envelope = z.object({
  data: z.object({ n: z.number() }),
  meta: z.object({ total: z.number() }).optional(),
});

function makeApp(env: 'test' | 'production' = 'test') {
  const app = express();
  app.set('env', env);
  app.use(pinoHttp({ logger: pino({ level: 'silent' }) }));
  app.use(express.json());
  app.post('/things/:id', validate(schemas), (req, res) => {
    const { params, query, body } = valid(req, schemas);
    // The assignments below only compile if the inferred types are right.
    const page: number = query.page;
    const id: string = params.id;
    res.json({ id, page, name: body.name });
  });
  app.get('/drift', (_req, res) => {
    respond(res, envelope, { data: { n: 'oops' } } as unknown as z.input<typeof envelope>);
  });
  app.get('/ok', (_req, res) => {
    respond(res, envelope, { data: { n: 1 }, meta: { total: 3 } });
  });
  app.use(createErrorHandler({ isProduction: env === 'production' }));
  return app;
}

describe('validate', () => {
  it('exposes parsed and coerced values with defaults applied', async () => {
    const res = await request(makeApp()).post('/things/abc?page=3').send({ name: 'x' });
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toEqual({ id: 'abc', page: 3, name: 'x' });
    const defaulted = await request(makeApp()).post('/things/abc').send({ name: 'x' });
    expect(bodyOf(defaulted)).toMatchObject({ page: 1 });
  });

  it.each([
    ['body', '/things/abc', {}],
    ['query', '/things/abc?page=0', { name: 'x' }],
    ['params', '/things/a', { name: 'x' }],
  ])('rejects an invalid %s with 400 and details', async (_part, url, payload) => {
    const res = await request(makeApp()).post(url).send(payload);
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    expect(errorOf(res).details).toBeDefined();
  });
});

describe('respond', () => {
  it('wraps data and meta in the envelope', async () => {
    const res = await request(makeApp()).get('/ok');
    expect(bodyOf(res)).toEqual({ data: { n: 1 }, meta: { total: 3 } });
  });

  it('fails with 500 when the output drifts from its schema outside production', async () => {
    const res = await request(makeApp('test')).get('/drift');
    expect(res.status).toBe(500);
  });

  it('skips output validation in production', async () => {
    const res = await request(makeApp('production')).get('/drift');
    expect(res.status).toBe(200);
  });
});
