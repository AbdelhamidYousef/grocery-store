import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { cartItems, carts, productVariants } from '../../db/schema/index.ts';
import { makeTestApp, TEST_ORIGIN } from '../../test/app.ts';
import { createProduct, createUser } from '../../test/factories.ts';
import { bodyOf, cookieValue, errorOf, setCookieLine } from '../../test/http.ts';
import { createSession } from '../auth/sessions.ts';

const app = makeTestApp();

type Method = 'get' | 'post' | 'patch' | 'delete';
interface CartBody {
  data: {
    items: { id: string; variantId: string; quantity: number; unitPriceCents: number }[];
    subtotalCents: number;
    itemCount: number;
    warnings: { code: string }[];
  };
}
const cartOf = (res: request.Response) => bodyOf<CartBody>(res).data;

// A shopper's browser: remembers the guest cart cookie the API sets, like a cookie jar would.
// Pass a session token to act as a signed-in user instead.
function shopper(sid?: string) {
  let cartCookie = '';
  const call = async (method: Method, path: string, body?: object) => {
    const req = request(app)[method](`/api/v1${path}`);
    if (method !== 'get') req.set('Origin', TEST_ORIGIN);
    const cookies = [sid ? `sid=${sid}` : '', cartCookie].filter(Boolean);
    if (cookies.length) req.set('Cookie', cookies);
    const res = await (body ? req.send(body) : req);
    const fresh = cookieValue(res, 'cart_id');
    if (fresh) cartCookie = `cart_id=${fresh}`;
    return res;
  };
  return { call, cookie: () => cartCookie };
}

async function member() {
  const user = await createUser();
  const { token } = await createSession(user.id);
  return { user, ...shopper(token) };
}

const add = (variantId: string, quantity = 1) => ({ variantId, quantity });

describe('GET /cart', () => {
  it('creates a guest cart on demand and sets the signed cookie', async () => {
    const guest = shopper();
    const res = await guest.call('get', '/cart');
    expect(res.status).toBe(200);
    expect(cartOf(res)).toMatchObject({ items: [], subtotalCents: 0, itemCount: 0, warnings: [] });
    expect(setCookieLine(res, 'cart_id')).toContain('HttpOnly');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await db.select().from(carts)).toHaveLength(1);

    await guest.call('get', '/cart');
    expect(await db.select().from(carts)).toHaveLength(1);
  });

  it('gives two guests two separate carts', async () => {
    const { variants } = await createProduct();
    const a = shopper();
    const b = shopper();
    await a.call('post', '/cart/items', add(variants[0]!.id, 2));
    expect(cartOf(await b.call('get', '/cart')).itemCount).toBe(0);
    expect(cartOf(await a.call('get', '/cart')).itemCount).toBe(2);
  });

  it('gives a signed-in user their own cart across requests, with no guest cookie', async () => {
    const { variants } = await createProduct();
    const me = await member();
    const res = await me.call('post', '/cart/items', add(variants[0]!.id, 2));
    expect(setCookieLine(res, 'cart_id')).toBeUndefined();
    expect(cartOf(await me.call('get', '/cart')).itemCount).toBe(2);
  });
});

describe('POST /cart/items', () => {
  it('adds a line and returns the whole repriced cart', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1250 }] });
    const res = await shopper().call('post', '/cart/items', add(variants[0]!.id, 2));
    expect(res.status).toBe(200);
    expect(cartOf(res)).toMatchObject({ itemCount: 2, subtotalCents: 2500 });
    expect(cartOf(res).items).toHaveLength(1);
  });

  it('adds to the existing quantity instead of creating a second line', async () => {
    const { variants } = await createProduct();
    const guest = shopper();
    await guest.call('post', '/cart/items', add(variants[0]!.id, 2));
    const res = await guest.call('post', '/cart/items', add(variants[0]!.id, 3));
    expect(cartOf(res).items).toHaveLength(1);
    expect(cartOf(res).items[0]?.quantity).toBe(5);
  });

  it('rejects a total above stock with 409 OUT_OF_STOCK and the numbers in details', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 5, reserved: 1 }] });
    const variantId = variants[0]!.id;
    const guest = shopper();
    await guest.call('post', '/cart/items', add(variantId, 3));

    const res = await guest.call('post', '/cart/items', add(variantId, 2));
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('OUT_OF_STOCK');
    expect(errorOf(res).details).toEqual({ variantId, maxQty: 4, inCart: 3, requested: 2 });
    // The failed add changed nothing.
    expect(cartOf(await guest.call('get', '/cart')).itemCount).toBe(3);
  });

  it('refuses a sold-out variant outright', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 0 }] });
    const res = await shopper().call('post', '/cart/items', add(variants[0]!.id));
    expect(res.status).toBe(409);
    expect(errorOf(res).details).toMatchObject({ maxQty: 0 });
  });

  it('never lets one line pass 99 even with plenty of stock', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 500 }] });
    const guest = shopper();
    expect((await guest.call('post', '/cart/items', add(variants[0]!.id, 99))).status).toBe(200);
    const res = await guest.call('post', '/cart/items', add(variants[0]!.id, 1));
    expect(res.status).toBe(409);
    expect(errorOf(res).details).toMatchObject({ maxQty: 99, inCart: 99 });
  });

  it('answers 404 for an unknown, archived or draft variant', async () => {
    const archived = await createProduct({ variants: [{ status: 'archived' }] });
    const draft = await createProduct({ status: 'draft' });
    const guest = shopper();
    for (const id of [
      '11111111-1111-4111-8111-111111111111',
      archived.variants[0]!.id,
      draft.variants[0]!.id,
    ]) {
      const res = await guest.call('post', '/cart/items', add(id));
      expect(res.status).toBe(404);
    }
  });

  it.each([
    ['quantity 0', { quantity: 0 }],
    ['quantity 100', { quantity: 100 }],
    ['a fractional quantity', { quantity: 1.5 }],
    ['a string quantity', { quantity: '2' }],
    ['a negative quantity', { quantity: -1 }],
    ['a variantId that is not a uuid', { variantId: 'abc' }],
    ['a missing variantId', { variantId: undefined }],
  ])('rejects %s with VALIDATION_ERROR', async (_label, patch) => {
    const { variants } = await createProduct();
    const res = await shopper().call('post', '/cart/items', { ...add(variants[0]!.id), ...patch });
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
  });

  it('refuses a request without the web Origin (CSRF) and creates nothing', async () => {
    const { variants } = await createProduct();
    const res = await request(app).post('/api/v1/cart/items').send(add(variants[0]!.id));
    expect(res.status).toBe(403);
    expect(await db.select().from(carts)).toHaveLength(0);
  });

  it('ignores a price or cartId sent in the body', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1000 }] });
    const victim = await member();
    await victim.call('post', '/cart/items', add(variants[0]!.id, 1));
    const [victimCart] = await db.select().from(carts).where(eq(carts.userId, victim.user.id));

    const res = await shopper().call('post', '/cart/items', {
      ...add(variants[0]!.id, 1),
      unitPriceCents: 1,
      priceCents: 1,
      cartId: victimCart?.id,
    });
    expect(cartOf(res)).toMatchObject({ subtotalCents: 1000, itemCount: 1 });
    const victimItems = await db
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, victimCart?.id ?? ''));
    expect(victimItems).toHaveLength(1);
    expect(victimItems[0]?.quantity).toBe(1);
  });

  it('slides the cart expiry when it is used', async () => {
    const { variants } = await createProduct();
    const guest = shopper();
    await guest.call('get', '/cart');
    const [row] = await db.select().from(carts);
    await db
      .update(carts)
      .set({ expiresAt: new Date(Date.now() + 24 * 3600 * 1000) })
      .where(eq(carts.id, row!.id));
    await guest.call('post', '/cart/items', add(variants[0]!.id));
    const [after] = await db.select().from(carts);
    expect(after!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
  });
});

describe('concurrency: serialised by the cart row lock', () => {
  it('lets only one of two parallel adds through when together they exceed stock', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 5 }] });
    const variantId = variants[0]!.id;
    const guest = shopper();
    await guest.call('get', '/cart'); // one cart first, so both adds target the same one

    const results = await Promise.all([
      guest.call('post', '/cart/items', add(variantId, 3)),
      guest.call('post', '/cart/items', add(variantId, 3)),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const [item] = await db.select().from(cartItems);
    expect(item?.quantity).toBe(3);
  });

  it('never exceeds stock under a burst of parallel single adds', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 4 }] });
    const variantId = variants[0]!.id;
    const guest = shopper();
    await guest.call('get', '/cart');

    const results = await Promise.all(
      Array.from({ length: 10 }, () => guest.call('post', '/cart/items', add(variantId, 1))),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(4);
    expect(results.filter((r) => r.status === 409)).toHaveLength(6);
    const items = await db.select().from(cartItems);
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(4);
  });
});

describe('PATCH /cart/items/:id', () => {
  async function withLine(stock = 10) {
    const { variants } = await createProduct({ variants: [{ stock, priceCents: 500 }] });
    const guest = shopper();
    const res = await guest.call('post', '/cart/items', add(variants[0]!.id, 2));
    return { guest, itemId: cartOf(res).items[0]!.id, variantId: variants[0]!.id };
  }

  it('sets an absolute quantity', async () => {
    const { guest, itemId } = await withLine();
    const res = await guest.call('patch', `/cart/items/${itemId}`, { quantity: 7 });
    expect(res.status).toBe(200);
    expect(cartOf(res)).toMatchObject({ itemCount: 7, subtotalCents: 3500 });
  });

  it('deletes the line when the quantity is 0', async () => {
    const { guest, itemId } = await withLine();
    const res = await guest.call('patch', `/cart/items/${itemId}`, { quantity: 0 });
    expect(cartOf(res).items).toEqual([]);
    expect(await db.select().from(cartItems)).toHaveLength(0);
  });

  it('answers 409 OUT_OF_STOCK above available stock and keeps the old quantity', async () => {
    const { guest, itemId, variantId } = await withLine(10);
    const res = await guest.call('patch', `/cart/items/${itemId}`, { quantity: 11 });
    expect(res.status).toBe(409);
    expect(errorOf(res).details).toEqual({ variantId, maxQty: 10, inCart: 2, requested: 11 });
    expect((await db.select().from(cartItems))[0]?.quantity).toBe(2);
  });

  it('answers 404 for a line that does not exist and 400 for a malformed id', async () => {
    const { guest } = await withLine();
    const missing = await guest.call('patch', '/cart/items/11111111-1111-4111-8111-111111111111', {
      quantity: 1,
    });
    expect(missing.status).toBe(404);
    expect((await guest.call('patch', '/cart/items/nope', { quantity: 1 })).status).toBe(400);
  });

  it('rejects a quantity above 99 or below 0', async () => {
    const { guest, itemId } = await withLine();
    expect((await guest.call('patch', `/cart/items/${itemId}`, { quantity: 100 })).status).toBe(
      400,
    );
    expect((await guest.call('patch', `/cart/items/${itemId}`, { quantity: -1 })).status).toBe(400);
  });

  it('reports a variant archived after it was added as 404 on update, gone on the next read', async () => {
    const { guest, itemId, variantId } = await withLine();
    await db
      .update(productVariants)
      .set({ status: 'archived' })
      .where(eq(productVariants.id, variantId));
    expect((await guest.call('patch', `/cart/items/${itemId}`, { quantity: 3 })).status).toBe(404);
    const read = cartOf(await guest.call('get', '/cart'));
    expect(read.items).toEqual([]);
    expect(read.warnings.map((w) => w.code)).toEqual(['VARIANT_UNAVAILABLE']);
  });
});

describe('DELETE /cart/items/:id and DELETE /cart', () => {
  it('removes one line and returns the rest', async () => {
    const a = await createProduct();
    const b = await createProduct();
    const guest = shopper();
    await guest.call('post', '/cart/items', add(a.variants[0]!.id));
    const second = await guest.call('post', '/cart/items', add(b.variants[0]!.id, 2));
    const toRemove = cartOf(second).items.find((i) => i.variantId === a.variants[0]!.id)!;

    const res = await guest.call('delete', `/cart/items/${toRemove.id}`);
    expect(res.status).toBe(200);
    expect(cartOf(res).items.map((i) => i.variantId)).toEqual([b.variants[0]!.id]);
    expect((await guest.call('delete', `/cart/items/${toRemove.id}`)).status).toBe(404);
  });

  it('clears the whole cart', async () => {
    const a = await createProduct();
    const b = await createProduct();
    const guest = shopper();
    await guest.call('post', '/cart/items', add(a.variants[0]!.id));
    await guest.call('post', '/cart/items', add(b.variants[0]!.id));
    const res = await guest.call('delete', '/cart');
    expect(res.status).toBe(200);
    expect(cartOf(res)).toMatchObject({ items: [], itemCount: 0, subtotalCents: 0 });
    expect(await db.select().from(cartItems)).toHaveLength(0);
  });
});

describe('cart ownership (no IDOR)', () => {
  async function aliceWithLine() {
    const { variants } = await createProduct({ variants: [{ stock: 20 }] });
    const alice = await member();
    const res = await alice.call('post', '/cart/items', add(variants[0]!.id, 2));
    return { alice, itemId: cartOf(res).items[0]!.id, variantId: variants[0]!.id };
  }

  const stillIntact = async (itemId: string) => {
    const [row] = await db.select().from(cartItems).where(eq(cartItems.id, itemId));
    expect(row?.quantity).toBe(2);
  };

  it("a guest cannot change or delete a signed-in user's line by id", async () => {
    const { itemId } = await aliceWithLine();
    const mallory = shopper();
    const patch = await mallory.call('patch', `/cart/items/${itemId}`, { quantity: 9 });
    const del = await mallory.call('delete', `/cart/items/${itemId}`);
    expect([patch.status, del.status]).toEqual([404, 404]);
    await stillIntact(itemId);
  });

  it('another signed-in user cannot touch your line by id', async () => {
    const { itemId } = await aliceWithLine();
    const bob = await member();
    const patch = await bob.call('patch', `/cart/items/${itemId}`, { quantity: 9 });
    const del = await bob.call('delete', `/cart/items/${itemId}`);
    expect([patch.status, del.status]).toEqual([404, 404]);
    expect(errorOf(patch).code).toBe('NOT_FOUND');
    await stillIntact(itemId);
  });

  it("one guest cannot touch another guest's line by id", async () => {
    const { variants } = await createProduct();
    const alice = shopper();
    const res = await alice.call('post', '/cart/items', add(variants[0]!.id, 2));
    const itemId = cartOf(res).items[0]!.id;
    const mallory = shopper();
    expect((await mallory.call('delete', `/cart/items/${itemId}`)).status).toBe(404);
    await stillIntact(itemId);
  });

  it("DELETE /cart clears only the caller's cart", async () => {
    const { itemId } = await aliceWithLine();
    const bob = await member();
    await bob.call('delete', '/cart');
    await stillIntact(itemId);
  });

  it("a cart_id cookie that is unsigned or names someone else's cart gives a fresh cart, not theirs", async () => {
    const { alice, itemId } = await aliceWithLine();
    const [aliceCart] = await db.select().from(carts).where(eq(carts.userId, alice.user.id));
    const res = await request(app).get('/api/v1/cart').set('Cookie', `cart_id=${aliceCart!.id}`);
    expect(cartOf(res).items).toEqual([]);
    await stillIntact(itemId);
  });

  it('a signed-in user never sees the guest cart named by a leftover cookie', async () => {
    const { variants } = await createProduct();
    const guest = shopper();
    await guest.call('post', '/cart/items', add(variants[0]!.id, 4));
    const user = await createUser();
    const { token } = await createSession(user.id);
    // Same browser, now signed in, still holding the guest cookie.
    const res = await request(app)
      .get('/api/v1/cart')
      .set('Cookie', [`sid=${token}`, guest.cookie()]);
    expect(cartOf(res).itemCount).toBe(0);
  });
});

describe('cart is not cached', () => {
  it('sends no-store on every cart response, errors included', async () => {
    const guest = shopper();
    expect((await guest.call('get', '/cart')).headers['cache-control']).toBe('no-store');
    const bad = await guest.call('post', '/cart/items', { variantId: 'x', quantity: 1 });
    expect(bad.headers['cache-control']).toBe('no-store');
  });
});
