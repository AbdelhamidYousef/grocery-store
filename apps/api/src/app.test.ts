import { Writable } from 'node:stream';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createLogger } from './lib/logger.ts';
import { makeTestApp } from './test/app.ts';
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
