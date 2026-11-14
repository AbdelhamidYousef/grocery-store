import type { Cart } from '@store/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  bulkTiers,
  charities,
  discountCodes,
  donations,
  payments,
  pointsLedger,
} from '../../db/schema/index.ts';
import { makeTestApp, TEST_HOOK_SECRET } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { orderByNumber, signedIn } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';

let app: ReturnType<typeof makeTestApp>;
let gateway: FakeStripe;
beforeEach(async () => {
  gateway = new FakeStripe();
  app = makeTestApp({ payments: gateway });
  await createShippingMethods();
});

const UK_ADDRESS = {
  fullName: 'Ada Lovelace',
  line1: '1 Bone Street',
  city: 'London',
  postalCode: 'SW1A 1AA',
  country: 'GB',
};
const EU_ADDRESS = { ...UK_ADDRESS, city: 'Riga', postalCode: 'LV-1010', country: 'LV' };

const cartOf = (res: request.Response) => bodyOf<{ data: Cart }>(res).data;
const simulate = (body: object) =>
  request(app)
    .post('/api/v1/test/webhooks/simulate')
    .set('X-Test-Hook-Secret', TEST_HOOK_SECRET)
    .send(body);

async function ukOrder(opts: { eur?: number; gbp?: number; quantity?: number } = {}) {
  const { variants } = await createProduct({
    variants: [{ priceCents: opts.eur ?? 1500, gbpCents: opts.gbp ?? 1300, stock: 20 }],
  });
  const shopper = makeShopper(app, undefined, 'uk-en');
  await shopper.addToCart(variants[0]!.id, opts.quantity ?? 2);
  const res = await shopper.call('post', '/checkout', {
    email: 'ada@pawsome.test',
    shippingAddress: UK_ADDRESS,
    shippingMethodCode: 'standard',
  });
  expect(res.status).toBe(200);
  const number = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
  return { number, shopper, variantId: variants[0]!.id };
}

describe('cart in the store currency', () => {
  it('prices a UK cart in GBP, with the GBP shipping rate card', async () => {
    const { variants } = await createProduct({
      variants: [{ priceCents: 1500, gbpCents: 1300, weightGrams: 200 }],
    });
    const uk = makeShopper(app, undefined, 'uk-en');
    const cart = cartOf(await uk.addToCart(variants[0]!.id, 2));
    expect(cart).toMatchObject({ currency: 'GBP', subtotalCents: 2600 });
    // GBP standard: 450 + 1 started kg x 100 (not the 490 + 100 of EUR).
    expect(cart.pricing.shippingEstimateCents).toBe(550);
    expect(cart.pricing.totalEstimateCents).toBe(3150);

    const eu = makeShopper(app, undefined, 'eu-en');
    const euCart = cartOf(await eu.addToCart(variants[0]!.id, 2));
    expect(euCart).toMatchObject({ currency: 'EUR', subtotalCents: 3000 });
    expect(euCart.pricing.shippingEstimateCents).toBe(590);
  });

  it('applies the free-shipping threshold of each currency', async () => {
    const { variants } = await createProduct({
      variants: [{ priceCents: 1500, gbpCents: 1450, stock: 20 }],
    });
    const id = variants[0]!.id;
    // 3 units: EUR 45.00 is under 49.00; GBP 43.50 is over 42.00.
    const eu = makeShopper(app, undefined, 'eu-en');
    expect(cartOf(await eu.addToCart(id, 3)).pricing.shippingEstimateCents).toBeGreaterThan(0);
    const uk = makeShopper(app, undefined, 'uk-en');
    expect(cartOf(await uk.addToCart(id, 3)).pricing.shippingEstimateCents).toBe(0);
  });

  it('re-prices the same cart when the shopper switches store, dropping unpriced lines', async () => {
    const both = await createProduct({ variants: [{ priceCents: 1000, gbpCents: 850 }] });
    const eurOnly = await createProduct({ variants: [{ priceCents: 2000 }] });
    const eu = makeShopper(app, undefined, 'eu-en');
    await eu.addToCart(both.variants[0]!.id, 1);
    await eu.addToCart(eurOnly.variants[0]!.id, 1);
    // Same cookie jar, other store view.
    const uk = makeShopper(app, undefined, 'uk-en');
    for (const [k, v] of eu.jar) uk.jar.set(k, v);
    const cart = cartOf(await uk.call('get', '/cart'));
    expect(cart.currency).toBe('GBP');
    expect(cart.items.map((i) => i.unitPriceCents)).toEqual([850]);
    expect(cart.warnings.map((w) => w.code)).toEqual(['VARIANT_UNAVAILABLE']);
  });

  it('uses the per-currency amount of a fixed code, and refuses a code with none', async () => {
    await db.insert(discountCodes).values([
      {
        code: 'FIVE',
        kind: 'fixed',
        value: 500,
        valueByCurrency: { GBP: 400 },
        minSpendCents: 0,
      },
      { code: 'EURONLY', kind: 'fixed', value: 500 },
    ]);
    const { variants } = await createProduct({ variants: [{ priceCents: 3000, gbpCents: 2500 }] });
    const uk = makeShopper(app, undefined, 'uk-en');
    await uk.addToCart(variants[0]!.id, 1);
    const ok = await uk.call('post', '/cart/code', { code: 'FIVE' });
    expect(cartOf(ok).pricing.discountCents).toBe(400);
    const refused = await uk.call('post', '/cart/code', { code: 'EURONLY' });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    const eu = makeShopper(app, undefined, 'eu-en');
    await eu.addToCart(variants[0]!.id, 1);
    expect(
      cartOf(await eu.call('post', '/cart/code', { code: 'FIVE' })).pricing.discountCents,
    ).toBe(500);
  });

  it('uses the tier threshold of the currency, and no tier where there is none', async () => {
    await db.insert(bulkTiers).values([
      { minCents: 5000, minByCurrency: { GBP: 4000 }, percent: 10 },
      { minCents: 9000, percent: 20 },
    ]);
    const { variants } = await createProduct({
      variants: [{ priceCents: 5000, gbpCents: 4000, stock: 20 }],
    });
    for (const [store, discount] of [
      ['uk-en', 400],
      ['eu-en', 500],
    ] as const) {
      const shopper = makeShopper(app, undefined, store);
      expect(cartOf(await shopper.addToCart(variants[0]!.id, 1)).pricing.discountCents).toBe(
        discount,
      );
    }
    // The 20 % tier has no GBP threshold: even a big GBP cart only gets the 10 % one.
    const big = makeShopper(app, undefined, 'uk-en');
    expect(cartOf(await big.addToCart(variants[0]!.id, 3)).pricing.discountCents).toBe(1200);
  });
});

describe('checkout and payment in the order currency', () => {
  it('places a GBP order that snapshots store view, locale and currency, and asks Stripe in GBP', async () => {
    const { number } = await ukOrder({ gbp: 1300, quantity: 2 });
    const order = await orderByNumber(number);
    expect(order).toMatchObject({
      currency: 'GBP',
      storeView: 'uk-en',
      locale: 'en-GB',
      subtotalCents: 2600,
      shippingCents: 550,
      totalCents: 3150,
    });
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(payment).toMatchObject({ currency: 'GBP', amountCents: 3150 });
    const intent = await gateway.retrievePaymentIntent(payment!.providerPaymentIntentId!);
    expect(intent).toMatchObject({ currency: 'gbp', amountCents: 3150 });
  });

  it('rejects a payment in another currency than the order', async () => {
    const { number } = await ukOrder();
    expect((await simulate({ orderNumber: number, currency: 'eur' })).status).toBe(200);
    const order = await orderByNumber(number);
    expect(order.status).toBe('pending_payment');
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(payment?.lastError).toMatch(/Amount mismatch.*eur.*GBP/);
    await simulate({ orderNumber: number });
    expect((await orderByNumber(number)).status).toBe('paid');
  });

  it('makes a new intent in the new currency when the shopper switches store mid-checkout', async () => {
    const { variants } = await createProduct({
      variants: [{ priceCents: 1500, gbpCents: 1300, stock: 20 }],
    });
    const body = (address: object) => ({
      email: 'ada@pawsome.test',
      shippingAddress: address,
      shippingMethodCode: 'standard',
    });
    const eu = makeShopper(app, undefined, 'eu-en');
    await eu.addToCart(variants[0]!.id, 2);
    const first = await eu.call('post', '/checkout', body(EU_ADDRESS));
    expect(first.status).toBe(200);
    const uk = makeShopper(app, undefined, 'uk-en');
    for (const [k, v] of eu.jar) uk.jar.set(k, v);
    const second = await uk.call('post', '/checkout', body(UK_ADDRESS));
    expect(second.status).toBe(200);
    const number = bodyOf<{ data: { orderNumber: string } }>(second).data.orderNumber;
    expect(number).toBe(bodyOf<{ data: { orderNumber: string } }>(first).data.orderNumber);
    const order = await orderByNumber(number);
    expect(order.currency).toBe('GBP');
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(payment).toMatchObject({ currency: 'GBP', amountCents: order.totalCents });
    const intent = await gateway.retrievePaymentIntent(payment!.providerPaymentIntentId!);
    expect(intent.currency).toBe('gbp');
    expect(gateway.cancelled).toHaveLength(1);
  });

  it('can still pay after switching store EUR -> GBP -> EUR before paying', async () => {
    const { variants } = await createProduct({
      variants: [{ priceCents: 1500, gbpCents: 1300, stock: 20 }],
    });
    const body = (address: object) => ({
      email: 'ada@pawsome.test',
      shippingAddress: address,
      shippingMethodCode: 'standard',
    });
    const eu = makeShopper(app, undefined, 'eu-en');
    await eu.addToCart(variants[0]!.id, 2);
    expect((await eu.call('post', '/checkout', body(EU_ADDRESS))).status).toBe(200);
    const uk = makeShopper(app, undefined, 'uk-en');
    for (const [k, v] of eu.jar) uk.jar.set(k, v);
    expect((await uk.call('post', '/checkout', body(UK_ADDRESS))).status).toBe(200);
    for (const [k, v] of uk.jar) eu.jar.set(k, v);
    const back = await eu.call('post', '/checkout', body(EU_ADDRESS));
    expect(back.status).toBe(200);
    const order = await orderByNumber(
      bodyOf<{ data: { orderNumber: string } }>(back).data.orderNumber,
    );
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    const intent = await gateway.retrievePaymentIntent(payment!.providerPaymentIntentId!);
    // A live EUR intent, not the first one (cancelled at the first switch) replayed by its key.
    expect(intent).toMatchObject({ currency: 'eur', amountCents: order.totalCents });
    expect(intent.status).not.toBe('canceled');
    expect(gateway.cancelled).toHaveLength(2);
  });

  it('ships only to the store view countries, in checkout and in quotes', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1500, gbpCents: 1300 }] });
    const uk = makeShopper(app, undefined, 'uk-en');
    await uk.addToCart(variants[0]!.id, 1);
    const wrong = await uk.call('post', '/checkout', {
      email: 'ada@pawsome.test',
      shippingAddress: EU_ADDRESS,
      shippingMethodCode: 'standard',
    });
    expect(wrong.status).toBe(400);
    expect(errorOf(wrong).message).toBeTruthy();
    expect((await uk.call('get', '/checkout/shipping-methods?country=LV')).status).toBe(400);
    const quotes = await uk.call('get', '/checkout/shipping-methods?country=GB');
    expect(quotes.status).toBe(200);
    expect(
      bodyOf<{ data: { code: string; priceCents: number; currency: string }[] }>(quotes).data.map(
        (q) => [q.code, q.currency],
      ),
    ).toEqual([
      ['standard', 'GBP'],
      ['express', 'GBP'],
    ]);

    const eu = makeShopper(app, undefined, 'eu-en');
    await eu.addToCart(variants[0]!.id, 1);
    expect((await eu.call('get', '/checkout/shipping-methods?country=GB')).status).toBe(400);
  });

  it('records the currency on points, donations and analytics, never summing across currencies', async () => {
    await db.insert(charities).values({
      slug: 'whisker-hollow',
      name: 'Whisker Hollow Rescue',
      description: 'A demo shelter.',
    });
    const admin = await signedIn(app, 'admin');
    const customer = await signedIn(app, 'customer');
    const { variants } = await createProduct({
      variants: [{ priceCents: 2000, gbpCents: 1700, stock: 20 }],
    });
    const shopper = makeShopper(app, customer.shopper.jar.get('sid'), 'uk-en');
    await shopper.addToCart(variants[0]!.id, 2);
    const res = await shopper.call('post', '/checkout', {
      email: customer.user.email,
      shippingAddress: UK_ADDRESS,
      shippingMethodCode: 'standard',
      roundUpDonation: true,
    });
    expect(res.status).toBe(200);
    const number = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
    await simulate({ orderNumber: number });
    const order = await orderByNumber(number);
    expect(order.donationCents).toBeGreaterThan(0);

    const ledger = await db.select().from(pointsLedger).where(eq(pointsLedger.orderId, order.id));
    expect(ledger.length).toBeGreaterThan(0);
    expect(ledger.every((l) => l.currency === 'GBP')).toBe(true);
    const gift = await db.select().from(donations).where(eq(donations.orderId, order.id));
    expect(gift).toMatchObject([{ currency: 'GBP', source: 'round_up' }]);

    // A EUR order too: the report of each currency counts only its own.
    const eu = makeShopper(app, undefined, 'eu-en');
    await eu.addToCart(variants[0]!.id, 1);
    const euRes = await eu.call('post', '/checkout', {
      email: 'eu@pawsome.test',
      shippingAddress: EU_ADDRESS,
      shippingMethodCode: 'standard',
    });
    await simulate({
      orderNumber: bodyOf<{ data: { orderNumber: string } }>(euRes).data.orderNumber,
    });
    const report = async (currency: string) =>
      bodyOf<{ data: { currency: string; orders: number; revenue: { totalCents: number } } }>(
        await admin.shopper.call('get', `/admin/analytics?currency=${currency}`),
      ).data;
    const gbp = await report('GBP');
    const eur = await report('EUR');
    expect(gbp).toMatchObject({ currency: 'GBP', orders: 1 });
    expect(eur).toMatchObject({ currency: 'EUR', orders: 1 });
    expect(gbp.revenue.totalCents).toBe(order.totalCents - order.donationCents);
    expect(eur.revenue.totalCents).toBe(2000 + 590);
  });
});
