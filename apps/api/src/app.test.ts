import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.ts';

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok', async () => {
    const app = createApp({ logger: pino({ level: 'silent' }), nodeEnv: 'test' });

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
