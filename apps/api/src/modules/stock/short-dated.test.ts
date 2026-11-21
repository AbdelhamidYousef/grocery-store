import { addDays } from '@store/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { orderItemBatches, orderItems } from '../../db/schema/index.ts';
import { DEFAULT_STORE_ID } from '../../db/seed/delivery.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf } from '../../test/http.ts';
import { TEST_ADDRESS, orderByNumber, simulate, stockOf } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';
import { batchesOf, expectBatchInvariant, setBatches } from '../../test/stock.ts';

import { todayKey } from './batches.ts';

const fake = new FakeStripe();
const app = makeTestApp({ payments: fake });
const today = todayKey();
const inDays = (n: number) => addDays(today, n);

beforeEach(async () => {
  await createShippingMethods();
});
afterEach(expectBatchInvariant);

async function shelf(batches: { bestBefore: string | null; quantity: number }[], price = 1000) {
  const product = await createProduct({ shelfLifeDays: 7, variants: [{ priceCents: price }] });
  const variantId = product.variants[0]!.id;
  await setBatches(DEFAULT_STORE_ID, variantId, batches);
  return { slug: product.product.slug, variantId };
}

interface Pdp {
  data: {
    variants: {
      bestBefore: string | null;
      shortDated: {
        units: number;
        bestBefore: string;
        priceCents: number;
        percentOff: number;
      } | null;
    }[];
  };
}
interface CartBody {
  data: {
    items: {
      shortDated: boolean;
      bestBefore: string | null;
      unitPriceCents: number;
      lineTotalCents: number;
      quantity: number;
      available: number;
    }[];
    subtotalCents: number;
  };
}

const checkout = (shopper: ReturnType<typeof makeShopper>) =>
  shopper.call('post', '/checkout', {
    email: 'ada@grocery.test',
    shippingAddress: TEST_ADDRESS,
    shippingMethodCode: 'standard',
  });

describe('best before and the short-dated offer on the product page', () => {
  it('shows the oldest date the store could send, and the offer next to it', async () => {
    const { slug } = await shelf([
      { bestBefore: inDays(1), quantity: 3 },
      { bestBefore: inDays(2), quantity: 2 },
      { bestBefore: inDays(6), quantity: 4 },
      { bestBefore: inDays(12), quantity: 5 },
    ]);
    const res = await makeShopper(app).call('get', `/products/${slug}`);
    const [variant] = bodyOf<Pdp>(res).data.variants;
    expect(variant!.bestBefore).toBe(inDays(6));
    expect(variant!.shortDated).toEqual({
      units: 5,
      bestBefore: inDays(1),
      priceCents: 700,
      percentOff: 30,
    });
  });

  it('shows nothing for non-food, and no offer when nothing is short-dated', async () => {
    const goods = await createProduct({ variants: [{ priceCents: 500 }] });
    const plain = await shelf([{ bestBefore: inDays(10), quantity: 4 }]);
    const a = bodyOf<Pdp>(await makeShopper(app).call('get', `/products/${goods.product.slug}`));
    expect(a.data.variants[0]).toMatchObject({ bestBefore: null, shortDated: null });
    const b = bodyOf<Pdp>(await makeShopper(app).call('get', `/products/${plain.slug}`));
    expect(b.data.variants[0]).toMatchObject({ bestBefore: inDays(10), shortDated: null });
  });

  it('falls back to the short-dated date when every pack is short-dated, ignores expired packs', async () => {
    const { slug } = await shelf([
      { bestBefore: addDays(today, -1), quantity: 3 },
      { bestBefore: inDays(2), quantity: 2 },
    ]);
    const [variant] = bodyOf<Pdp>(await makeShopper(app).call('get', `/products/${slug}`)).data
      .variants;
    expect(variant!.bestBefore).toBe(inDays(2));
    expect(variant!.shortDated?.units).toBe(2);
  });

  it('counts the offer: units held by an unpaid short-dated order are taken off', async () => {
    const { slug, variantId } = await shelf([
      { bestBefore: inDays(1), quantity: 5 },
      { bestBefore: inDays(9), quantity: 5 },
    ]);
    const buyer = makeShopper(app);
    await buyer.call('post', '/cart/items', { variantId, quantity: 3, shortDated: true });
    expect((await checkout(buyer)).status).toBe(200);
    const [variant] = bodyOf<Pdp>(await makeShopper(app).call('get', `/products/${slug}`)).data
      .variants;
    expect(variant!.shortDated?.units).toBe(2);
    // Normal stock was reserved by the same order: 10 - 3 free, but the offer only has 2 left.
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 3 });
  });

  it('lists the products with short-dated packs on the shelf for the store', async () => {
    const a = await shelf([{ bestBefore: inDays(2), quantity: 3 }]);
    const b = await shelf([{ bestBefore: inDays(1), quantity: 3 }]);
    await shelf([{ bestBefore: inDays(8), quantity: 3 }]);
    const res = await makeShopper(app).call('get', '/products/short-dated');
    expect(res.status).toBe(200);
    const slugs = bodyOf<{ data: { slug: string }[] }>(res).data.map((c) => c.slug);
    expect(slugs).toEqual([b.slug, a.slug]); // soonest date first
  });
});

describe('buying short-dated', () => {
  it('prices the line 30 % off, carries the flag and the date, and caps at the short-dated packs', async () => {
    const { variantId } = await shelf(
      [
        { bestBefore: inDays(2), quantity: 3 },
        { bestBefore: inDays(8), quantity: 20 },
      ],
      999,
    );
    const shopper = makeShopper(app);
    const res = await shopper.call('post', '/cart/items', {
      variantId,
      quantity: 2,
      shortDated: true,
    });
    expect(res.status).toBe(200);
    const [line] = bodyOf<CartBody>(res).data.items;
    expect(line).toMatchObject({
      shortDated: true,
      bestBefore: inDays(2),
      unitPriceCents: 699, // 999 - round(299.7) = 999 - 300
      quantity: 2,
      lineTotalCents: 1398,
    });
    // Three short-dated packs in all, two already in the cart.
    const more = await shopper.call('post', '/cart/items', {
      variantId,
      quantity: 2,
      shortDated: true,
    });
    expect(more.status).toBe(409);
    expect(
      bodyOf<{ error: { details: { maxQty: number; inCart: number } } }>(more).error.details,
    ).toMatchObject({ maxQty: 3, inCart: 2 });
  });

  it('one line per variant: choosing the other offer switches the line', async () => {
    const { variantId } = await shelf([
      { bestBefore: inDays(1), quantity: 4 },
      { bestBefore: inDays(8), quantity: 20 },
    ]);
    const shopper = makeShopper(app);
    await shopper.call('post', '/cart/items', { variantId, quantity: 3 });
    const res = await shopper.call('post', '/cart/items', {
      variantId,
      quantity: 2,
      shortDated: true,
    });
    const { items } = bodyOf<CartBody>(res).data;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ shortDated: true, quantity: 2, unitPriceCents: 700 });
    const back = await shopper.call('post', '/cart/items', { variantId, quantity: 1 });
    expect(bodyOf<CartBody>(back).data.items[0]).toMatchObject({
      shortDated: false,
      quantity: 1,
      unitPriceCents: 1000,
    });
  });

  it('refuses a short-dated add when the store has none', async () => {
    const { variantId } = await shelf([{ bestBefore: inDays(9), quantity: 6 }]);
    const res = await makeShopper(app).call('post', '/cart/items', {
      variantId,
      quantity: 1,
      shortDated: true,
    });
    expect(res.status).toBe(409);
  });

  it('checks out at the reduced price and, once paid, takes only short-dated packs', async () => {
    const { variantId } = await shelf([
      { bestBefore: inDays(1), quantity: 4 },
      { bestBefore: inDays(8), quantity: 6 },
    ]);
    const shopper = makeShopper(app);
    await shopper.call('post', '/cart/items', { variantId, quantity: 3, shortDated: true });
    const placed = await checkout(shopper);
    expect(placed.status).toBe(200);
    const number = bodyOf<{ data: { orderNumber: string } }>(placed).data.orderNumber;
    const order = await orderByNumber(number);
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(line).toMatchObject({ shortDated: true, unitPriceCents: 700, lineTotalCents: 2100 });
    await simulate(app, number);
    expect(
      (await batchesOf(DEFAULT_STORE_ID, variantId)).map((b) => [b.bestBefore, b.quantity]),
    ).toEqual([
      [inDays(1), 1],
      [inDays(8), 6],
    ]);
    const taken = await db
      .select()
      .from(orderItemBatches)
      .where(eq(orderItemBatches.orderItemId, line!.id));
    expect(taken).toMatchObject([{ quantity: 3, shortDated: true }]);
  });

  it('a normal line keeps away from the short-dated packs while others are left', async () => {
    const { variantId } = await shelf([
      { bestBefore: inDays(1), quantity: 4 },
      { bestBefore: inDays(8), quantity: 6 },
    ]);
    const shopper = makeShopper(app);
    await shopper.call('post', '/cart/items', { variantId, quantity: 6 });
    const number = bodyOf<{ data: { orderNumber: string } }>(await checkout(shopper)).data
      .orderNumber;
    await simulate(app, number);
    expect(
      (await batchesOf(DEFAULT_STORE_ID, variantId)).map((b) => [b.bestBefore, b.quantity]),
    ).toEqual([
      [inDays(1), 4],
      [inDays(8), 0],
    ]);
  });

  it('two checkouts racing for the last short-dated pack: exactly one gets it', async () => {
    const { variantId } = await shelf([
      { bestBefore: inDays(1), quantity: 1 },
      { bestBefore: inDays(8), quantity: 20 },
    ]);
    const a = makeShopper(app);
    const b = makeShopper(app);
    expect(
      (await a.call('post', '/cart/items', { variantId, quantity: 1, shortDated: true })).status,
    ).toBe(200);
    expect(
      (await b.call('post', '/cart/items', { variantId, quantity: 1, shortDated: true })).status,
    ).toBe(200);
    const [first, second] = await Promise.all([checkout(a), checkout(b)]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const failed = first.status === 409 ? first : second;
    expect(['OUT_OF_STOCK', 'CART_CHANGED']).toContain(
      bodyOf<{ error: { code: string } }>(failed).error.code,
    );
    expect(await stockOf(variantId)).toEqual({ quantity: 21, reserved: 1 });
  });

  it('a retried payment does not compete with its own earlier attempt', async () => {
    const { variantId } = await shelf([
      { bestBefore: inDays(1), quantity: 2 },
      { bestBefore: inDays(8), quantity: 20 },
    ]);
    const shopper = makeShopper(app);
    await shopper.call('post', '/cart/items', { variantId, quantity: 2, shortDated: true });
    expect((await checkout(shopper)).status).toBe(200);
    expect((await checkout(shopper)).status).toBe(200);
    expect(await stockOf(variantId)).toEqual({ quantity: 22, reserved: 2 });
  });

  it('a cancelled paid short-dated order puts its packs back into the same short batch', async () => {
    const { variantId } = await shelf([
      { bestBefore: inDays(1), quantity: 4 },
      { bestBefore: inDays(8), quantity: 6 },
    ]);
    const shopper = makeShopper(app);
    await shopper.call('post', '/cart/items', { variantId, quantity: 2, shortDated: true });
    const number = bodyOf<{ data: { orderNumber: string } }>(await checkout(shopper)).data
      .orderNumber;
    await simulate(app, number);
    const { transitionOrder } = await import('../orders/service.ts');
    const { pino } = await import('pino');
    await transitionOrder({ gateway: fake, log: pino({ level: 'silent' }) }, number, 'cancelled', {
      actor: 'admin:t@t.test',
    });
    expect(
      (await batchesOf(DEFAULT_STORE_ID, variantId)).map((b) => [b.bestBefore, b.quantity]),
    ).toEqual([
      [inDays(1), 4],
      [inDays(8), 6],
    ]);
  });
});
