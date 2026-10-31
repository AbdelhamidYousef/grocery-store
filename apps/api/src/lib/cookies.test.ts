import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { clearSessionCookie, setSessionCookie } from './cookies.ts';

function appFor(env: string) {
  const app = express();
  app.set('env', env);
  app.get('/set', (_req, res) => {
    setSessionCookie(res, 'token-value');
    res.end();
  });
  app.get('/clear', (_req, res) => {
    clearSessionCookie(res);
    res.end();
  });
  return app;
}

const cookieOf = (res: request.Response) => res.headers['set-cookie']?.[0] ?? '';

describe('session cookie', () => {
  it('is HttpOnly, SameSite=Lax, path / and lasts 30 days', async () => {
    const cookie = cookieOf(await request(appFor('test')).get('/set'));
    expect(cookie).toContain('sid=token-value');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${30 * 24 * 3600}`);
    expect(cookie).not.toContain('Domain');
    expect(cookie).not.toContain('Secure');
  });

  it('is Secure in production only', async () => {
    expect(cookieOf(await request(appFor('production')).get('/set'))).toContain('Secure');
  });

  it('is cleared with the same attributes', async () => {
    const cookie = cookieOf(await request(appFor('production')).get('/clear'));
    expect(cookie).toContain('sid=;');
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
  });
});
