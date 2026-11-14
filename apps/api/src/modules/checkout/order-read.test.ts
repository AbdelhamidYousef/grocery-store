import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods, createUser } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { makeShopper } from '../../test/shopper.ts';
import { createSession } from '../auth/sessions.ts';

let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  app = makeTestApp({ payments: new FakeStripe() });
  await createShippingMethods();
});

const checkoutBody = {
  email: 'ada@grocery.test',
  shippingAddress: {
    fullName: 'Ada Lovelace',
    line1: '1 Bone Street',
    city: 'Riga',
    postalCode: 'LV-1010',
    country: 'DE',
  },
  shippingMethodCode: 'standard',
  notes: 'Ring twice',
};

interface Status {
  data: { status: string; paymentStatus: string | null };
}
interface Detail {
  data: {
    number: string;
    status: string;
    email: string;
    notes: string | null;
    totals: { totalCents: number };
    items: { productName: string; quantity: number; lineTotalCents: number }[];
    shippingAddress: { postalCode: string };
    billingAddress: unknown;
  };
}

async function guestOrder() {
  const { variants } = await createProduct({ name: 'Tug Rope', variants: [{ priceCents: 1000 }] });
  const guest = makeShopper(app);
  await guest.addToCart(variants[0]!.id, 2);
  const res = await guest.call('post', '/checkout', checkoutBody);
  const number = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
  return { guest, number, variantId: variants[0]!.id };
}

describe('GET /checkout/orders/:number/status', () => {
  it('lets the guest who placed the order poll it through the signed cookie', async () => {
    const { guest, number } = await guestOrder();
    const res = await guest.call('get', `/checkout/orders/${number}/status`);
    expect(res.status).toBe(200);
    expect(bodyOf<Status>(res).data).toEqual({
      status: 'pending_payment',
      paymentStatus: 'requires_payment',
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('does not create a guest cart as a side effect', async () => {
    const { number } = await guestOrder();
    const stranger = makeShopper(app);
    await stranger.call('get', `/checkout/orders/${number}/status`);
    expect(stranger.jar.has('cart_id')).toBe(false);
  });

  it('answers 404 to a visitor without the cookie, exactly as for an order that does not exist', async () => {
    const { number } = await guestOrder();
    const stranger = makeShopper(app);
    const hidden = await stranger.call('get', `/checkout/orders/${number}/status`);
    const missing = await stranger.call('get', '/checkout/orders/PW-2026-999999/status');
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(errorOf(hidden)).toEqual(errorOf(missing));
  });

  it('answers 404 when the cookie belongs to a different order', async () => {
    const first = await guestOrder();
    const second = await guestOrder();
    const res = await first.guest.call('get', `/checkout/orders/${second.number}/status`);
    expect(res.status).toBe(404);
  });

  it('rejects an unsigned or forged last_order cookie', async () => {
    const { number } = await guestOrder();
    const forged = await request(app)
      .get(`/api/v1/checkout/orders/${number}/status`)
      .set('Cookie', `last_order=${number}`);
    expect(forged.status).toBe(404);
    const badSignature = await request(app)
      .get(`/api/v1/checkout/orders/${number}/status`)
      .set('Cookie', `last_order=s%3A${number}.not-a-real-signature`);
    expect(badSignature.status).toBe(404);
  });

  it('lets the signed-in owner read it with no cookie, and nobody else', async () => {
    const owner = await createUser();
    const other = await createUser();
    const { token } = await createSession(owner.id);
    const { variants } = await createProduct();
    const member = makeShopper(app, token);
    await member.addToCart(variants[0]!.id);
    const placed = await member.call('post', '/checkout', checkoutBody);
    const number = bodyOf<{ data: { orderNumber: string } }>(placed).data.orderNumber;

    const fresh = makeShopper(app, token); // same account, new browser: no last_order cookie
    expect((await fresh.call('get', `/checkout/orders/${number}/status`)).status).toBe(200);

    const intruder = makeShopper(app, (await createSession(other.id)).token);
    expect((await intruder.call('get', `/checkout/orders/${number}/status`)).status).toBe(404);
  });

  it('rejects a malformed order number with 400', async () => {
    const res = await makeShopper(app).call('get', "/checkout/orders/PW-1';drop/status");
    expect(res.status).toBe(400);
  });
});

describe('GET /checkout/orders/:number', () => {
  it('returns the order with its snapshot items, totals and addresses', async () => {
    const { guest, number } = await guestOrder();
    const res = await guest.call('get', `/checkout/orders/${number}`);
    expect(res.status).toBe(200);
    const order = bodyOf<Detail>(res).data;
    expect(order).toMatchObject({
      number,
      status: 'pending_payment',
      email: 'ada@grocery.test',
      notes: 'Ring twice',
      totals: { totalCents: 2590 },
      billingAddress: null,
      shippingAddress: { postalCode: 'LV-1010' },
    });
    expect(order.items).toMatchObject([
      { productName: 'Tug Rope', quantity: 2, lineTotalCents: 2000 },
    ]);
  });

  it('applies the same access rule as the status endpoint', async () => {
    const { number } = await guestOrder();
    const res = await makeShopper(app).call('get', `/checkout/orders/${number}`);
    expect(res.status).toBe(404);
  });
});
