import type { Cart } from '@store/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { payments } from '../../db/schema/index.ts';
import { makeTestApp, TEST_HOOK_SECRET } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { orderByNumber } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';

let app: ReturnType<typeof makeTestApp>;
let gateway: FakeStripe;
beforeEach(async () => {
  gateway = new FakeStripe();
  app = makeTestApp({ payments: gateway });
  await createShippingMethods();
});

const DE_ADDRESS = {
  fullName: 'Ada Lovelace',
  line1: '1 Lindenstrasse',
  city: 'Berlin',
  postalCode: '10115',
  country: 'DE',
};
const FR_ADDRESS = { ...DE_ADDRESS, city: 'Paris', postalCode: '75001', country: 'FR' };

const cartOf = (res: request.Response) => bodyOf<{ data: Cart }>(res).data;
const simulate = (body: object) =>
  request(app)
    .post('/api/v1/test/webhooks/simulate')
    .set('X-Test-Hook-Secret', TEST_HOOK_SECRET)
    .send(body);

async function order(quantity = 2, store = 'de-en') {
  const { variants } = await createProduct({ variants: [{ priceCents: 1500, stock: 20 }] });
  const shopper = makeShopper(app, undefined, store);
  await shopper.addToCart(variants[0]!.id, quantity);
  const res = await shopper.call('post', '/checkout', {
    email: 'ada@grocery.test',
    shippingAddress: DE_ADDRESS,
    shippingMethodCode: 'standard',
  });
  expect(res.status).toBe(200);
  return bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
}

// The shop sells in EUR only (both store views). The price engine still reads the currency from
// the store view, so these tests pin that the whole chain says EUR.
describe('cart and checkout in the store currency', () => {
  it('prices a cart in EUR with the EUR shipping rate card, in both store views', async () => {
    const { variants } = await createProduct({
      variants: [{ priceCents: 1500, weightGrams: 200 }],
    });
    for (const store of ['de-en', 'de-de']) {
      const cart = cartOf(await makeShopper(app, undefined, store).addToCart(variants[0]!.id, 2));
      expect(cart).toMatchObject({ currency: 'EUR', subtotalCents: 3000 });
      // The basket rules: a slot 2.99 (the cheapest one, until a time is chosen).
      expect(cart.pricing.shippingEstimateCents).toBe(299);
    }
  });

  it('applies the free-shipping threshold', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1500, stock: 20 }] });
    const shopper = makeShopper(app, undefined, 'de-en');
    expect(cartOf(await shopper.addToCart(variants[0]!.id, 3)).pricing.shippingEstimateCents).toBe(
      299,
    );
    // 4 x 15.00 = 60.00 of goods: past 49.00.
    expect(cartOf(await shopper.addToCart(variants[0]!.id, 1)).pricing.shippingEstimateCents).toBe(
      0,
    );
  });

  it('places an EUR order that snapshots store view, locale and currency, and asks Stripe in EUR', async () => {
    const number = await order(2);
    const placed = await orderByNumber(number);
    expect(placed).toMatchObject({
      currency: 'EUR',
      storeView: 'de-en',
      locale: 'en-IE',
      subtotalCents: 3000,
      shippingCents: 299,
      bagFeeCents: 25,
      totalCents: 3324,
    });
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, placed.id));
    expect(payment).toMatchObject({ currency: 'EUR', amountCents: 3324 });
    const intent = await gateway.retrievePaymentIntent(payment!.providerPaymentIntentId!);
    expect(intent).toMatchObject({ currency: 'eur', amountCents: 3324 });
  });

  it('rejects a payment in another currency than the order', async () => {
    const number = await order();
    expect((await simulate({ orderNumber: number, currency: 'gbp' })).status).toBe(200);
    const placed = await orderByNumber(number);
    expect(placed.status).toBe('pending_payment');
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, placed.id));
    expect(payment?.lastError).toMatch(/Amount mismatch.*gbp.*EUR/);
    await simulate({ orderNumber: number });
    expect((await orderByNumber(number)).status).toBe('paid');
  });

  it('ships only to Germany, in checkout and in quotes', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1500 }] });
    const shopper = makeShopper(app, undefined, 'de-de');
    await shopper.addToCart(variants[0]!.id, 1);
    const wrong = await shopper.call('post', '/checkout', {
      email: 'ada@grocery.test',
      shippingAddress: FR_ADDRESS,
      shippingMethodCode: 'standard',
    });
    expect(wrong.status).toBe(400);
    expect(errorOf(wrong).message).toBeTruthy();
    expect((await shopper.call('get', '/checkout/shipping-methods?country=FR')).status).toBe(400);
    const quotes = await shopper.call('get', '/checkout/shipping-methods?country=DE');
    expect(quotes.status).toBe(200);
    expect(
      bodyOf<{ data: { code: string; currency: string }[] }>(quotes).data.map((q) => [
        q.code,
        q.currency,
      ]),
    ).toEqual([
      ['standard', 'EUR'],
      ['express', 'EUR'],
    ]);
  });
});
