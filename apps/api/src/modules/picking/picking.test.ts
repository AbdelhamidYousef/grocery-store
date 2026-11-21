import type { PickingResult } from '@store/shared';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { aisles, orderItems, orders, products } from '../../db/schema/index.ts';
import { DEFAULT_STORE_ID } from '../../db/seed/delivery.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp } from '../../test/app.ts';
import { createCategory, createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf } from '../../test/http.ts';
import { orderByNumber, placeOrder, signedIn, simulate } from '../../test/orders.ts';
import { expectBatchInvariant, setBatches } from '../../test/stock.ts';
import { createOutbox } from '../mail/outbox.ts';

import { getPicking } from './service.ts';

const log = pino({ level: 'silent' });
let app: ReturnType<typeof makeTestApp>;

beforeEach(async () => {
  const fake = new FakeStripe();
  app = makeTestApp({
    payments: fake,
    outbox: createOutbox({ transport: new MemoryTransport(), log }),
  });
  await createShippingMethods();
});
afterEach(expectBatchInvariant);

async function paid(variantId: string, quantity = 2) {
  const buyer = await signedIn(app, 'customer');
  const placed = await placeOrder(app, {
    shopper: buyer.shopper,
    email: buyer.user.email,
    variantId,
    quantity,
  });
  expect((await simulate(app, placed.number)).status).toBe(200);
  return { number: placed.number, order: await orderByNumber(placed.number) };
}

const adminCall = async () => (await signedIn(app, 'admin')).shopper;

async function picking(admin: Awaited<ReturnType<typeof adminCall>>, query = '?window=all') {
  const res = await admin.call('get', `/admin/stores/mitte/picking${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return bodyOf<{ data: PickingResult }>(res).data;
}

async function product(
  name: string,
  opts: { storage?: 'chilled' | 'frozen'; aisle?: [number, 'ambient' | 'chilled' | 'frozen'] } = {},
) {
  const category = await createCategory();
  const p = await createProduct({
    name,
    categoryId: category.id,
    ...(opts.storage && { attributes: { storage: opts.storage } }),
    variants: [{ priceCents: 300, stock: 20 }],
  });
  if (opts.aisle) {
    await db.insert(aisles).values({
      storeId: DEFAULT_STORE_ID,
      subcategoryId: category.id,
      aisle: opts.aisle[0],
      zone: opts.aisle[1],
    });
  }
  return { id: p.variants[0]!.id, product: p.product };
}

describe('GET /admin/stores/:slug/picking', () => {
  it('is for admins only', async () => {
    const customer = await signedIn(app, 'customer');
    expect((await customer.shopper.call('get', '/admin/stores/mitte/picking')).status).toBe(403);
    expect((await signedIn(app, 'admin')).shopper).toBeTruthy();
    const admin = await adminCall();
    expect((await admin.call('get', '/admin/stores/nowhere/picking')).status).toBe(404);
  });

  it('lists the orders of the store in window order, numbering the bags, and sorts the walk', async () => {
    const pasta = await product('Pasta', { aisle: [4, 'ambient'] });
    const milk = await product('Milk', { aisle: [2, 'chilled'] });
    const peas = await product('Peas', { aisle: [1, 'frozen'] });
    const rice = await product('Rice', { aisle: [1, 'ambient'] });
    const a = await paid(pasta.id, 2);
    const b = await paid(milk.id, 1);
    const c = await paid(peas.id, 3);
    const d = await paid(rice.id, 1);
    // Windows: b first, then a, then c, d as express.
    const base = Date.now() + 3_600_000;
    await db
      .update(orders)
      .set({ deliveryFrom: new Date(base + 7_200_000) })
      .where(eq(orders.id, a.order.id));
    await db
      .update(orders)
      .set({ deliveryFrom: new Date(base) })
      .where(eq(orders.id, b.order.id));
    await db
      .update(orders)
      .set({ deliveryFrom: new Date(base + 14_400_000) })
      .where(eq(orders.id, c.order.id));
    await db
      .update(orders)
      .set({ deliveryKind: 'express', deliveryFrom: null })
      .where(eq(orders.id, d.order.id));
    const data = await picking(await adminCall());
    expect(data.orders.map((o) => o.number)).toEqual([b.number, a.number, c.number, d.number]);
    expect(data.orders.map((o) => o.bag)).toEqual([1, 2, 3, 4]);
    expect(data.pickList.map((e) => e.productName)).toEqual(['Rice', 'Pasta', 'Milk', 'Peas']);
    const pastaStops = data.pickList.find((e) => e.productName === 'Pasta')!;
    expect(pastaStops.stops).toMatchObject([{ orderNumber: a.number, bag: 2, quantity: 2 }]);
  });

  it('"next" keeps orders whose window starts within two hours and express orders', async () => {
    const x = await product('Soon');
    const y = await product('Later');
    const z = await product('Rush');
    const soon = await paid(x.id);
    const later = await paid(y.id);
    const rush = await paid(z.id);
    const now = Date.now();
    await db
      .update(orders)
      .set({ deliveryFrom: new Date(now + 3_600_000) })
      .where(eq(orders.id, soon.order.id));
    await db
      .update(orders)
      .set({ deliveryFrom: new Date(now + 5 * 3_600_000) })
      .where(eq(orders.id, later.order.id));
    await db.update(orders).set({ deliveryKind: 'express' }).where(eq(orders.id, rush.order.id));
    const admin = await adminCall();
    const next = await picking(admin, '?window=next');
    expect(next.orders.map((o) => o.number).sort()).toEqual([soon.number, rush.number].sort());
    const all = await picking(admin, '?window=all');
    expect(all.orders).toHaveLength(3);
  });

  it('leaves out unpaid, other stores, dispatched and cancelled orders', async () => {
    const x = await product('Mine');
    const mine = await paid(x.id);
    const other = await paid(x.id);
    const gone = await paid(x.id);
    const sent = await paid(x.id);
    await db
      .update(orders)
      .set({ darkStoreId: 'b0000000-0000-4000-8000-000000000002' })
      .where(eq(orders.id, other.order.id));
    await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, gone.order.id));
    await db
      .update(orders)
      .set({ dispatchedAt: new Date(), status: 'shipped' })
      .where(eq(orders.id, sent.order.id));
    const data = await picking(await adminCall());
    expect(data.orders.map((o) => o.number)).toEqual([mine.number]);
  });

  it('falls back to how a product is kept when the store has no aisle for it', async () => {
    const ice = await product('Ice', { storage: 'frozen' });
    const bread = await product('Bread');
    const milk = await product('Cold milk', { storage: 'chilled' });
    await paid(ice.id);
    await paid(bread.id);
    await paid(milk.id);
    const data = await picking(await adminCall());
    expect(data.pickList.map((e) => [e.productName, e.zone, e.aisle])).toEqual([
      ['Bread', 'ambient', null],
      ['Cold milk', 'chilled', null],
      ['Ice', 'frozen', null],
    ]);
  });

  it('shows the packs to take, oldest best-before first', async () => {
    const x = await product('Yoghurt');
    await setBatches(DEFAULT_STORE_ID, x.id, [
      { bestBefore: '2027-02-10', quantity: 10 },
      { bestBefore: '2027-02-01', quantity: 1 },
    ]);
    await paid(x.id, 3);
    const data = await picking(await adminCall());
    expect(data.pickList[0]?.stops[0]?.batches).toEqual([
      { bestBefore: '2027-02-01', quantity: 1 },
      { bestBefore: '2027-02-10', quantity: 2 },
    ]);
  });
});

describe('POST /admin/orders/:number/items/:itemId/pick', () => {
  const lineOf = async (orderId: string) =>
    (await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)))[0]!;
  const mark = (
    admin: Awaited<ReturnType<typeof adminCall>>,
    number: string,
    id: string,
    body: object,
  ) => admin.call('post', `/admin/orders/${number}/items/${id}/pick`, body);

  it('marks a line found, undoes it, and is idempotent', async () => {
    const x = await product('Rice');
    const o = await paid(x.id);
    const line = await lineOf(o.order.id);
    const admin = await adminCall();
    expect((await mark(admin, o.number, line.id, { action: 'found' })).status).toBe(200);
    expect((await mark(admin, o.number, line.id, { action: 'found' })).status).toBe(200);
    expect((await lineOf(o.order.id)).pickStatus).toBe('picked');
    const data = await picking(admin);
    expect(data.orders[0]?.openLines).toBe(0);
    expect((await mark(admin, o.number, line.id, { action: 'reset' })).status).toBe(200);
    expect((await lineOf(o.order.id)).pickStatus).toBe('pending');
  });

  it('keeps grams for a weighed line until dispatch and asks for them', async () => {
    const category = await createCategory();
    const p = await createProduct({
      name: 'Loose bananas',
      categoryId: category.id,
      variants: [
        { priceCents: 200, stock: 20, weight: { pricePerKgCents: 200, nominalGrams: 1000 } },
      ],
    });
    const o = await paid(p.variants[0]!.id, 1);
    const line = await lineOf(o.order.id);
    const admin = await adminCall();
    expect((await mark(admin, o.number, line.id, { action: 'found' })).status).toBe(422);
    expect((await mark(admin, o.number, line.id, { action: 'weigh', grams: 0 })).status).toBe(400);
    expect((await mark(admin, o.number, line.id, { action: 'weigh', grams: 1180 })).status).toBe(
      200,
    );
    expect(await lineOf(o.order.id)).toMatchObject({
      pickStatus: 'picked',
      packedGrams: 1180,
      weighedGrams: null,
      finalCents: null,
    });
    // A typo on the scale can be corrected: nothing is frozen yet.
    expect((await mark(admin, o.number, line.id, { action: 'weigh', grams: 1130 })).status).toBe(
      200,
    );
    expect((await lineOf(o.order.id)).packedGrams).toBe(1130);
    expect((await mark(admin, o.number, line.id, { action: 'reset' })).status).toBe(200);
    expect(await lineOf(o.order.id)).toMatchObject({ pickStatus: 'pending', packedGrams: null });
  });

  it('refuses grams on a line not sold by weight, unknown lines and foreign lines', async () => {
    const x = await product('Rice');
    const o = await paid(x.id);
    const other = await paid(x.id);
    const line = await lineOf(o.order.id);
    const admin = await adminCall();
    expect((await mark(admin, o.number, line.id, { action: 'weigh', grams: 500 })).status).toBe(
      422,
    );
    expect(
      (await mark(admin, o.number, '0b4c0a53-0d0d-4a0a-8a0a-0a0a0a0a0a0a', { action: 'found' }))
        .status,
    ).toBe(404);
    expect((await mark(admin, other.number, line.id, { action: 'found' })).status).toBe(404);
  });

  it('leaves a recorded shortfall alone', async () => {
    const x = await product('Rice');
    const o = await paid(x.id, 3);
    const line = await lineOf(o.order.id);
    const admin = await adminCall();
    expect(
      (
        await admin.call('post', `/admin/orders/${o.number}/items/${line.id}/shortfall`, {
          pickedQty: 1,
        })
      ).status,
    ).toBe(200);
    expect((await mark(admin, o.number, line.id, { action: 'found' })).status).toBe(409);
    expect((await mark(admin, o.number, line.id, { action: 'reset' })).status).toBe(409);
  });

  it('refuses once the bag is closed or the order is not being packed', async () => {
    const x = await product('Rice');
    const o = await paid(x.id);
    const line = await lineOf(o.order.id);
    await db.update(orders).set({ packedAt: new Date() }).where(eq(orders.id, o.order.id));
    const admin = await adminCall();
    expect((await mark(admin, o.number, line.id, { action: 'found' })).status).toBe(409);
    await db
      .update(orders)
      .set({ packedAt: null, status: 'cancelled' })
      .where(eq(orders.id, o.order.id));
    expect((await mark(admin, o.number, line.id, { action: 'found' })).status).toBe(409);
  });

  it('is for admins only', async () => {
    const x = await product('Rice');
    const o = await paid(x.id);
    const line = await lineOf(o.order.id);
    const customer = await signedIn(app, 'customer');
    expect((await mark(customer.shopper, o.number, line.id, { action: 'found' })).status).toBe(403);
  });
});

void products;

describe('GET /admin/orders/:number/items/:itemId/substitutes', () => {
  it('offers the safe neighbours of the order store, and nothing when the shopper said no', async () => {
    const category = await createCategory();
    const make = (name: string, price: number) =>
      createProduct({
        name,
        categoryId: category.id,
        shelfLifeDays: 10,
        food: { allergens: [], dietary: [] },
        variants: [{ priceCents: price, stock: 10 }],
      });
    const a = await make('Oat drink', 200);
    await make('Soy drink', 210);
    const o = await paid(a.variants[0]!.id, 2);
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, o.order.id));
    const admin = await adminCall();
    const res = await admin.call('get', `/admin/orders/${o.number}/items/${line!.id}/substitutes`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(bodyOf<{ data: { productName: string }[] }>(res).data.map((x) => x.productName)).toEqual(
      ['Soy drink'],
    );
    await db.update(orderItems).set({ substitution: 'none' }).where(eq(orderItems.id, line!.id));
    const none = await admin.call('get', `/admin/orders/${o.number}/items/${line!.id}/substitutes`);
    expect(bodyOf<{ data: unknown[] }>(none).data).toEqual([]);
  });
});

describe('a long queue', () => {
  it('cuts the list at the limit, oldest window first, and reports the total', async () => {
    const x = await product('Rice');
    const made = [];
    for (let i = 0; i < 4; i += 1) made.push(await paid(x.id, 1));
    const base = Date.now() + 3_600_000;
    for (const [i, m] of made.entries()) {
      await db
        .update(orders)
        .set({ deliveryFrom: new Date(base + (3 - i) * 60_000) })
        .where(eq(orders.id, m.order.id));
    }
    const data = await getPicking('mitte', 'all', new Date(), 2);
    expect(data.totalOrders).toBe(4);
    expect(data.orders.map((o) => o.number)).toEqual([made[3]?.number, made[2]?.number]);
  });
});

describe('finding one bag', () => {
  it('returns that order whatever its window, and nothing for another store or a dispatched order', async () => {
    const x = await product('Rice');
    const far = await paid(x.id, 1);
    const other = await paid(x.id, 1);
    await db
      .update(orders)
      .set({ deliveryFrom: new Date(Date.now() + 5 * 86_400_000) })
      .where(eq(orders.id, far.order.id));
    const admin = await adminCall();
    expect((await picking(admin, '?window=next')).orders.map((o) => o.number)).toEqual([
      other.number,
    ]);
    const found = await picking(admin, `?window=next&order=${far.number.toLowerCase()}`);
    expect(found.orders.map((o) => o.number)).toEqual([far.number]);
    expect(found.totalOrders).toBe(1);
    await db.update(orders).set({ dispatchedAt: new Date() }).where(eq(orders.id, far.order.id));
    expect((await picking(admin, `?order=${far.number}`)).orders).toEqual([]);
    expect((await admin.call('get', '/admin/stores/mitte/picking?order=nope')).status).toBe(400);
  });
});
