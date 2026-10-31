import { createHmac } from 'node:crypto';

import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../db/client.ts';
import { carts } from '../db/schema/index.ts';
import { createSession } from '../modules/auth/sessions.ts';
import { createCart, createUser } from '../test/factories.ts';
import { bodyOf, cookieValue, setCookieLine } from '../test/http.ts';

import { attachUser } from './auth.ts';
import { cartIdOf, withCart } from './cart.ts';
import { createErrorHandler } from './error.ts';

const SECRET = 'cart-middleware-test-secret-0123456789';

// Same algorithm as cookie-signature (what cookie-parser verifies): HMAC-SHA256, base64, no padding.
const sign = (value: string, secret = SECRET) =>
  `s:${value}.${createHmac('sha256', secret).update(value).digest('base64').replace(/=+$/, '')}`;
const cartCookie = (value: string) => `cart_id=${encodeURIComponent(sign(value))}`;

function makeApp() {
  const app = express();
  app.set('env', 'test');
  app.use(pinoHttp({ logger: pino({ level: 'silent' }) }));
  app.use(cookieParser(SECRET));
  app.use(attachUser);
  app.get('/with-cart', withCart, (req, res) => {
    res.json({ cartId: cartIdOf(req) });
  });
  app.get('/without-cart', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(createErrorHandler({ isProduction: false }));
  return app;
}

const idOf = (res: request.Response) => bodyOf<{ cartId: string }>(res).cartId;
const allCarts = () => db.select().from(carts);

describe('cart identity', () => {
  it('creates no cart for a visitor who never touches the cart', async () => {
    await request(makeApp()).get('/without-cart');
    expect(await allCarts()).toHaveLength(0);
  });

  it('creates a guest cart and a signed, HttpOnly, SameSite=Lax 30-day cookie on first use', async () => {
    const res = await request(makeApp()).get('/with-cart');
    const [row] = await allCarts();
    expect(row).toMatchObject({ id: idOf(res), userId: null, status: 'active' });
    expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);

    const line = setCookieLine(res, 'cart_id') ?? '';
    expect(decodeURIComponent(cookieValue(res, 'cart_id') ?? '')).toMatch(/^s:[0-9a-f-]{36}\./);
    expect(line).toContain('HttpOnly');
    expect(line).toContain('SameSite=Lax');
    expect(line).toContain(`Max-Age=${30 * 24 * 3600}`);
    expect(line).toContain('Path=/');
  });

  it('reuses the guest cart on the next request without a new cookie', async () => {
    const app = makeApp();
    const first = await request(app).get('/with-cart');
    const cookie = `cart_id=${cookieValue(first, 'cart_id') ?? ''}`;
    const second = await request(app).get('/with-cart').set('Cookie', cookie);
    expect(idOf(second)).toBe(idOf(first));
    expect(setCookieLine(second, 'cart_id')).toBeUndefined();
    expect(await allCarts()).toHaveLength(1);
  });

  it('ignores an unsigned cookie even if it names a real cart', async () => {
    const { cart } = await createCart();
    const res = await request(makeApp()).get('/with-cart').set('Cookie', `cart_id=${cart.id}`);
    expect(idOf(res)).not.toBe(cart.id);
  });

  it('ignores a cookie signed with another secret or edited after signing', async () => {
    const { cart } = await createCart();
    const forged = `cart_id=${encodeURIComponent(sign(cart.id, 'some-other-secret'))}`;
    expect(idOf(await request(makeApp()).get('/with-cart').set('Cookie', forged))).not.toBe(
      cart.id,
    );

    const other = await createCart();
    const edited = `cart_id=${encodeURIComponent(sign(cart.id).replace(cart.id, other.cart.id))}`;
    const res = await request(makeApp()).get('/with-cart').set('Cookie', edited);
    expect(idOf(res)).not.toBe(other.cart.id);
  });

  it.each([
    ['merged', { status: 'merged' as const }],
    ['converted', { status: 'converted' as const }],
  ])('does not accept a signed cookie for a %s cart', async (_label, input) => {
    const { cart } = await createCart(input);
    const res = await request(makeApp()).get('/with-cart').set('Cookie', cartCookie(cart.id));
    expect(idOf(res)).not.toBe(cart.id);
    expect(setCookieLine(res, 'cart_id')).toBeDefined();
  });

  it("does not accept a signed cookie for a user's cart", async () => {
    const user = await createUser();
    const { cart } = await createCart({ userId: user.id });
    const res = await request(makeApp()).get('/with-cart').set('Cookie', cartCookie(cart.id));
    expect(idOf(res)).not.toBe(cart.id);
  });

  it('does not accept an expired guest cart', async () => {
    const { cart } = await createCart();
    await db
      .update(carts)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(carts.id, cart.id));
    const res = await request(makeApp()).get('/with-cart').set('Cookie', cartCookie(cart.id));
    expect(idOf(res)).not.toBe(cart.id);
  });

  it('gives a signed-in user their own active cart, created once, with a 90-day expiry', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const app = makeApp();
    const a = await request(app).get('/with-cart').set('Cookie', `sid=${token}`);
    const b = await request(app).get('/with-cart').set('Cookie', `sid=${token}`);

    expect(idOf(a)).toBe(idOf(b));
    expect(setCookieLine(a, 'cart_id')).toBeUndefined();
    const rows = await allCarts();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(user.id);
    expect(rows[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 24 * 3600 * 1000);
  });

  it('ignores a guest cookie while signed in (merging is the only way in)', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const { cart: guest } = await createCart();
    const res = await request(makeApp())
      .get('/with-cart')
      .set('Cookie', [`sid=${token}`, cartCookie(guest.id)]);
    expect(idOf(res)).not.toBe(guest.id);
  });

  it('never lets one user reach another user’s cart', async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const { cart: aliceCart } = await createCart({ userId: alice.id });
    const { token } = await createSession(bob.id);
    const res = await request(makeApp())
      .get('/with-cart')
      .set('Cookie', [`sid=${token}`, cartCookie(aliceCart.id)]);
    expect(idOf(res)).not.toBe(aliceCart.id);
  });

  it('retires an expired active user cart as abandoned and starts a fresh one', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const { cart: stale } = await createCart({ userId: user.id });
    await db
      .update(carts)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(carts.id, stale.id));

    const res = await request(makeApp()).get('/with-cart').set('Cookie', `sid=${token}`);
    expect(idOf(res)).not.toBe(stale.id);
    const rows = await allCarts();
    expect(rows.find((r) => r.id === stale.id)?.status).toBe('abandoned');
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(1);
  });

  it('creates exactly one cart when a new user fires simultaneous requests', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const app = makeApp();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => request(app).get('/with-cart').set('Cookie', `sid=${token}`)),
    );
    expect(new Set(results.map(idOf)).size).toBe(1);
    expect(await allCarts()).toHaveLength(1);
  });
});
