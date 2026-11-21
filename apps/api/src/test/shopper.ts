import type { Express } from 'express';
import request, { type Response } from 'supertest';

import { db } from '../db/client.ts';
import { lookupPostcode } from '../modules/delivery/areas.ts';
import { generateSlots } from '../modules/delivery/slot-generation.ts';

import { TEST_ORIGIN } from './app.ts';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface Shopper {
  call: (method: Method, path: string, body?: object) => Promise<Response>;
  jar: Map<string, string>;
  addToCart: (variantId: string, quantity?: number) => Promise<Response>;
  /** Holds the first open slot of the postcode's store for this shopper's cart. */
  pickSlot: (postcode?: string) => Promise<void>;
}

// A browser for tests: it keeps every cookie the API sets (cart_id, last_order, ...) and sends them
// back, drops the ones the API clears, and attaches the Origin header the CSRF check demands on
// writes. Pass a session token to act as a signed-in user.
// `store` is the store view the browser is on (`de-de`): sent as X-Store-View on every call.
// `postcode` is the delivery postcode the browser has chosen: sent as X-Postcode on every call.
// Since G5 checkout needs a delivery time: before a POST /checkout the shopper picks the first open
// slot of the address's store through the real API (PUT /cart/slot), unless the cart already has a
// delivery choice. `autoSlot: false` is for the tests of the delivery rules themselves.
export function makeShopper(
  app: Express,
  sid?: string,
  store?: string,
  postcode?: string,
  opts: { autoSlot?: boolean } = {},
): Shopper {
  const jar = new Map<string, string>();
  if (sid) jar.set('sid', sid);

  const send = async (method: Method, path: string, body?: object, asPostcode = postcode) => {
    const req = request(app)[method](`/api/v1${path}`);
    if (method !== 'get') req.set('Origin', TEST_ORIGIN);
    if (store) req.set('X-Store-View', store);
    if (asPostcode) req.set('X-Postcode', asPostcode);
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

  // Picks the first slot that is open and takes the order's store, trying the next one when a
  // parallel test took the last place. Like the real PUT /cart/slot it loads (and repairs) the cart,
  // so a test that changes stock or prices after filling the cart calls this BEFORE the change.
  let picked = false;
  const pickSlot = async (addressPostcode = postcode ?? '10115') => {
    if (!(await lookupPostcode(addressPostcode))) return;
    await generateSlots(db, new Date());
    const list = await send('get', '/delivery/slots', undefined, addressPostcode);
    const days = (list.body as { data: { days: { slots: { id: string; status: string }[] }[] } })
      .data.days;
    for (const slot of days.flatMap((d) => d.slots).filter((x) => x.status === 'open')) {
      const put = await send('put', '/cart/slot', { slotId: slot.id }, addressPostcode);
      if (put.status === 200) {
        picked = true;
        return;
      }
    }
    throw new Error('test helper: no open slot to pick');
  };

  const call = async (method: Method, path: string, body?: object) => {
    const address = (body as { shippingAddress?: { postalCode?: string } } | undefined)
      ?.shippingAddress?.postalCode;
    const hasCart = jar.has('cart_id') || jar.has('sid');
    if (
      opts.autoSlot !== false &&
      !picked &&
      hasCart &&
      method === 'post' &&
      path === '/checkout'
    ) {
      if (address) await pickSlot(address);
    }
    const res = await send(method, path, body);
    // A placed order used the hold: the next checkout of this shopper needs a new delivery time.
    if (method === 'post' && path === '/checkout' && res.status === 200) picked = false;
    if (/^\/cart\/(slot|express)$/.test(path) && method === 'put' && res.status === 200) {
      picked = true;
    }
    return res;
  };

  return {
    call,
    jar,
    pickSlot,
    addToCart: (variantId: string, quantity = 1) =>
      call('post', '/cart/items', { variantId, quantity }),
  };
}
