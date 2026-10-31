import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { placeOrder, signedIn, simulate } from '../../test/orders.ts';
import { transitionOrder } from '../orders/service.ts';

const fake = new FakeStripe();
const app = makeTestApp({ payments: fake });

beforeEach(async () => {
  await createShippingMethods();
});

interface Detail {
  data: {
    number: string;
    status: string;
    items: { productName: string }[];
    timeline: { status: string; at: string }[];
    totals: { totalCents: number };
  };
}

describe('GET /account/orders and /account/orders/:number', () => {
  it('shows my order with items, totals and a customer-safe timeline', async () => {
    const me = await signedIn(app);
    const { number } = await placeOrder(app, { shopper: me.shopper, quantity: 2 });
    await simulate(app, number);
    await transitionOrder({ gateway: fake, log: pino({ level: 'silent' }) }, number, 'processing', {
      actor: 'admin:boss@pawsome.test',
      note: 'secret internal note',
    });

    const res = await me.shopper.call('get', `/account/orders/${number}`);
    expect(res.status).toBe(200);
    const { data } = bodyOf<Detail>(res);
    expect(data.number).toBe(number);
    expect(data.status).toBe('processing');
    expect(data.items).toHaveLength(1);
    expect(data.timeline.map((t) => t.status)).toEqual(['pending_payment', 'paid', 'processing']);
    // Actors and notes are the shop's audit trail, not the customer's.
    expect(JSON.stringify(res.body)).not.toMatch(
      /boss@pawsome|secret internal note|system:webhook/,
    );
  });

  it('lists counts and thumbnails for each order', async () => {
    const me = await signedIn(app);
    const { number } = await placeOrder(app, { shopper: me.shopper, quantity: 3 });
    await simulate(app, number);
    const res = await me.shopper.call('get', '/account/orders');
    const [first] = bodyOf<{ data: { number: string; itemCount: number; thumbnails: string[] }[] }>(
      res,
    ).data;
    expect(first).toMatchObject({ number, itemCount: 3, thumbnails: [] });
  });

  it("answers 404 (not 403) for somebody else's order: no IDOR, no probing", async () => {
    const owner = await signedIn(app);
    const other = await signedIn(app);
    const { number } = await placeOrder(app, { shopper: owner.shopper });
    await simulate(app, number);

    const mine = await owner.shopper.call('get', `/account/orders/${number}`);
    expect(mine.status).toBe(200);

    const stolen = await other.shopper.call('get', `/account/orders/${number}`);
    const missing = await other.shopper.call('get', '/account/orders/PW-2026-999999');
    expect(stolen.status).toBe(404);
    expect(errorOf(stolen)).toEqual(errorOf(missing));
    expect(JSON.stringify(stolen.body)).not.toContain(number);
  });

  it('does not expose a guest order through any account, even with its number', async () => {
    const guest = await placeOrder(app);
    await simulate(app, guest.number);
    const me = await signedIn(app);
    const res = await me.shopper.call('get', `/account/orders/${guest.number}`);
    expect(res.status).toBe(404);
  });

  it('requires a signed-in user and a well-formed number', async () => {
    const anon = await placeOrder(app);
    const anonymous = await anon.shopper.call('get', `/account/orders/${anon.number}`);
    expect(anonymous.status).toBe(401);
    const me = await signedIn(app);
    const bad = await me.shopper.call('get', '/account/orders/not-a-number');
    expect(bad.status).toBe(400);
  });
});
