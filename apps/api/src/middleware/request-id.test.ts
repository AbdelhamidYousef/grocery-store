import { Writable } from 'node:stream';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createLogger } from '../lib/logger.ts';
import { makeTestApp } from '../test/app.ts';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      cb();
    },
  });
  return { lines, logger: createLogger({ level: 'info', destination }) };
}

describe('request id', () => {
  it('generates an id and returns it in the response header', async () => {
    const { logger } = capture();
    const res = await request(makeTestApp({ logger })).get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reuses a well-formed incoming id', async () => {
    const { logger } = capture();
    const res = await request(makeTestApp({ logger }))
      .get('/api/v1/health')
      .set('X-Request-Id', 'web-123.abc');
    expect(res.headers['x-request-id']).toBe('web-123.abc');
  });

  it('replaces an incoming id that is too long or has odd characters', async () => {
    const { logger } = capture();
    const res = await request(makeTestApp({ logger }))
      .get('/api/v1/health')
      .set('X-Request-Id', 'a b<script>');
    expect(res.headers['x-request-id']).not.toBe('a b<script>');
  });

  it('logs the request id with every access-log line', async () => {
    const { logger, lines } = capture();
    await request(makeTestApp({ logger })).get('/api/v1/health').set('X-Request-Id', 'trace-1');
    const access = lines.find((l) => l.res !== undefined);
    expect((access?.req as { id: string }).id).toBe('trace-1');
  });

  it('redacts cookie and authorization headers in logs', async () => {
    const { logger, lines } = capture();
    await request(makeTestApp({ logger }))
      .get('/api/v1/health')
      .set('Cookie', 'sid=secret')
      .set('Authorization', 'Bearer secret');
    const text = JSON.stringify(lines);
    expect(text).not.toContain('secret');
    expect(text).toContain('[Redacted]');
  });
});
