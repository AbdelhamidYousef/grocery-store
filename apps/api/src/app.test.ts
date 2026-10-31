import { Writable } from 'node:stream';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createLogger } from './lib/logger.ts';
import { makeTestApp, TEST_ORIGIN } from './test/app.ts';
import { bodyOf } from './test/http.ts';

describe('GET /api/v1/health', () => {
  it('reports ok with the database and the package version', async () => {
    const res = await request(makeTestApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(bodyOf(res)).toEqual({ status: 'ok', db: 'ok', version: '0.0.0' });
  });

  it('answers 503 and logs with the request id when the database is down', async () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const app = makeTestApp({
      logger: createLogger({ level: 'info', destination }),
      pingDb: () => Promise.reject(new Error('connection refused')),
    });

    const res = await request(app).get('/api/v1/health').set('X-Request-Id', 'outage-1');

    expect(res.status).toBe(503);
    expect(bodyOf(res)).toMatchObject({ status: 'degraded', db: 'down' });
    expect(lines.join('')).toContain('outage-1');
    expect(lines.join('')).toContain('database unreachable');
  });

  it('gives up on a hung database within the timeout instead of hanging', async () => {
    const app = makeTestApp({ pingDb: () => new Promise<void>(() => undefined) });
    const started = Date.now();

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(2500);
  });
});

// The phase 2 acceptance criterion: each failure mode gives the right status AND leaves a log line
// that carries the request id, so a support report can be traced.
describe('failure modes are logged with the request id', () => {
  function capturedApp(pingDb?: () => Promise<void>) {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const app = makeTestApp({
      logger: createLogger({ level: 'info', destination }),
      ...(pingDb && { pingDb }),
    });
    return { app, lines };
  }

  it.each([
    [
      'a bad JSON body',
      400,
      (r: request.Agent) =>
        r
          .post('/api/v1/x')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', 'application/json')
          .send('{oops'),
    ],
    ['an unknown route', 404, (r: request.Agent) => r.get('/api/v1/missing')],
    [
      'a foreign-origin POST',
      403,
      (r: request.Agent) => r.post('/api/v1/x').set('Origin', 'https://evil.example'),
    ],
  ])('%s', async (_name, status, send) => {
    const { app, lines } = capturedApp();
    const res = await send(request.agent(app)).set('X-Request-Id', 'trace-me');
    expect(res.status).toBe(status);
    expect(lines.join('')).toContain('trace-me');
  });

  it('a database outage', async () => {
    const { app, lines } = capturedApp(() => Promise.reject(new Error('down')));
    const res = await request(app).get('/api/v1/health').set('X-Request-Id', 'trace-me');
    expect(res.status).toBe(503);
    expect(lines.join('')).toContain('trace-me');
  });
});
