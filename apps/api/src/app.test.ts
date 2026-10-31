import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from './test/app.ts';

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(makeTestApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
