import type { Express } from 'express';
import request, { type Response } from 'supertest';

import { TEST_ORIGIN } from './app.ts';

type Method = 'get' | 'post' | 'patch' | 'delete';

export interface Shopper {
  call: (method: Method, path: string, body?: object) => Promise<Response>;
  jar: Map<string, string>;
  addToCart: (variantId: string, quantity?: number) => Promise<Response>;
}

// A browser for tests: it keeps every cookie the API sets (cart_id, last_order, ...) and sends them
// back, drops the ones the API clears, and attaches the Origin header the CSRF check demands on
// writes. Pass a session token to act as a signed-in user.
export function makeShopper(app: Express, sid?: string): Shopper {
  const jar = new Map<string, string>();
  if (sid) jar.set('sid', sid);

  const call = async (method: Method, path: string, body?: object) => {
    const req = request(app)[method](`/api/v1${path}`);
    if (method !== 'get') req.set('Origin', TEST_ORIGIN);
    if (jar.size)
      req.set(
        'Cookie',
        [...jar].map(([k, v]) => `${k}=${v}`),
      );
    const res = await (body ? req.send(body) : req);
    for (const line of [res.headers['set-cookie'] ?? []].flat()) {
      const [pair = '', ...attrs] = line.split(';').map((p) => p.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const expired = attrs.some((a) => /^expires=/i.test(a) && new Date(a.slice(8)) < new Date());
      if (value === '' || expired) jar.delete(name);
      else jar.set(name, value);
    }
    return res;
  };

  return {
    call,
    jar,
    addToCart: (variantId: string, quantity = 1) =>
      call('post', '/cart/items', { variantId, quantity }),
  };
}
