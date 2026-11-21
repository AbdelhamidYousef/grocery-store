import { addDays } from '@store/shared';
import { and, eq } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  inventory,
  inventoryAdjustments,
  orderItemBatches,
  orderItems,
  stockBatches,
} from '../../db/schema/index.ts';
import { DEFAULT_STORE_ID } from '../../db/seed/delivery.ts';
import { runJob } from '../../jobs/runner.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import {
  deliveredOrder,
  orderByNumber,
  placeOrder,
  signedIn,
  simulate,
  stockOf,
} from '../../test/orders.ts';
import { batchesOf, expectBatchInvariant, setBatches } from '../../test/stock.ts';
import { transitionOrder } from '../orders/service.ts';

import { todayKey, writeOffExpired } from './batches.ts';

const log = pino({ level: 'silent' });
const fake = new FakeStripe();
const app = makeTestApp({ payments: fake });
const today = todayKey();
const inDays = (n: number) => addDays(today, n);

beforeEach(async () => {
  await createShippingMethods();
});

async function food(batches: { bestBefore: string | null; quantity: number }[]) {
  const product = await createProduct({ shelfLifeDays: 7, variants: [{ priceCents: 500 }] });
  const variantId = product.variants[0]!.id;
  await setBatches(DEFAULT_STORE_ID, variantId, batches);
  return variantId;
}

const quantities = async (variantId: string) =>
  (await batchesOf(DEFAULT_STORE_ID, variantId)).map((b) => [b.bestBefore, b.quantity]);

describe('first expired, first out', () => {
  it('takes the oldest packs first when payment confirms and records what each line took', async () => {
    const variantId = await food([
      { bestBefore: inDays(9), quantity: 5 },
      { bestBefore: inDays(4), quantity: 3 },
      { bestBefore: null, quantity: 4 },
    ]);
    const { number } = await placeOrder(app, { variantId, quantity: 5 });
    // Reserved only: no pack has moved yet.
    expect(await quantities(variantId)).toEqual([
      [inDays(4), 3],
      [inDays(9), 5],
      [null, 4],
    ]);
    await simulate(app, number);
    expect(await quantities(variantId)).toEqual([
      [inDays(4), 0],
      [inDays(9), 3],
      [null, 4],
    ]);
    expect(await stockOf(variantId)).toEqual({ quantity: 7, reserved: 0 });
    const order = await orderByNumber(number);
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const taken = await db
      .select()
      .from(orderItemBatches)
      .where(eq(orderItemBatches.orderItemId, line!.id));
    expect(taken.map((t) => t.quantity).sort()).toEqual([2, 3]);
    await expectBatchInvariant();
  });

  it('sells packs with no date last, and prefers regular packs to short-dated ones for a normal line', async () => {
    const variantId = await food([
      { bestBefore: inDays(1), quantity: 4 }, // short-dated
      { bestBefore: inDays(20), quantity: 6 },
      { bestBefore: null, quantity: 3 },
    ]);
    const { number } = await placeOrder(app, { variantId, quantity: 7 });
    await simulate(app, number);
    // 6 regular dated + 1 undated; the short-dated batch is only a fallback.
    expect(await quantities(variantId)).toEqual([
      [inDays(1), 4],
      [inDays(20), 0],
      [null, 2],
    ]);
    await expectBatchInvariant();
  });

  it('uses short-dated and then expired packs only when nothing better is left', async () => {
    const variantId = await food([
      { bestBefore: addDays(today, -1), quantity: 2 },
      { bestBefore: inDays(1), quantity: 2 },
      { bestBefore: inDays(10), quantity: 1 },
    ]);
    const { number } = await placeOrder(app, { variantId, quantity: 5 });
    await simulate(app, number);
    expect(await quantities(variantId)).toEqual([
      [addDays(today, -1), 0],
      [inDays(1), 0],
      [inDays(10), 0],
    ]);
    await expectBatchInvariant();
  });

  it('separate orders draw from their own variant shelves in turn', async () => {
    const a = await food([
      { bestBefore: inDays(3), quantity: 2 },
      { bestBefore: inDays(8), quantity: 6 },
    ]);
    const b = await food([{ bestBefore: inDays(5), quantity: 4 }]);
    const first = await placeOrder(app, { variantId: a, quantity: 3 });
    const second = await placeOrder(app, { variantId: b, quantity: 1 });
    await simulate(app, first.number);
    await simulate(app, second.number);
    expect(await quantities(a)).toEqual([
      [inDays(3), 0],
      [inDays(8), 5],
    ]);
    expect(await quantities(b)).toEqual([[inDays(5), 3]]);
    await expectBatchInvariant();
  });
});

describe('cancel and refund put the packs back', () => {
  it('cancelling a paid order restores the same batches', async () => {
    const variantId = await food([
      { bestBefore: inDays(4), quantity: 3 },
      { bestBefore: inDays(9), quantity: 5 },
    ]);
    const { number } = await placeOrder(app, { variantId, quantity: 5 });
    await simulate(app, number);
    expect(await quantities(variantId)).toEqual([
      [inDays(4), 0],
      [inDays(9), 3],
    ]);
    await transitionOrder({ gateway: fake, log }, number, 'cancelled', { actor: 'admin:t@t.test' });
    expect(await quantities(variantId)).toEqual([
      [inDays(4), 3],
      [inDays(9), 5],
    ]);
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
    await expectBatchInvariant();
  });

  it('cancelling an unpaid order moves no batch', async () => {
    const variantId = await food([{ bestBefore: inDays(4), quantity: 6 }]);
    const { number } = await placeOrder(app, { variantId, quantity: 2 });
    await transitionOrder({ gateway: fake, log }, number, 'cancelled', { actor: 'admin:t@t.test' });
    expect(await quantities(variantId)).toEqual([[inDays(4), 6]]);
    expect(await stockOf(variantId)).toEqual({ quantity: 6, reserved: 0 });
    await expectBatchInvariant();
  });

  it('an order paid before batches existed comes back as a new undated batch', async () => {
    const variantId = await food([{ bestBefore: inDays(4), quantity: 6 }]);
    const { number } = await placeOrder(app, { variantId, quantity: 2 });
    await simulate(app, number);
    const order = await orderByNumber(number);
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    await db.delete(orderItemBatches).where(eq(orderItemBatches.orderItemId, lines[0]!.id));
    // The 2 packs left a batch but the record of it is gone (as for an order from before G6).
    await db.update(stockBatches).set({ quantity: 4 }).where(eq(stockBatches.variantId, variantId));
    await transitionOrder({ gateway: fake, log }, number, 'cancelled', { actor: 'admin:t@t.test' });
    expect(await stockOf(variantId)).toEqual({ quantity: 6, reserved: 0 });
    await expectBatchInvariant();
  });
});

describe('admin stock changes', () => {
  async function adminCall(variantId: string, body: object) {
    const { shopper } = await signedIn(app, 'admin', `boss${Math.random()}@grocery.test`);
    return shopper.call('patch', `/admin/inventory/${variantId}`, body);
  }

  it('an increase makes a batch dated from the shelf life, or from the date given', async () => {
    const variantId = await food([{ bestBefore: inDays(2), quantity: 3 }]);
    expect((await adminCall(variantId, { quantity: 8, reason: 'restock' })).status).toBe(200);
    expect(await quantities(variantId)).toEqual([
      [inDays(2), 3],
      [inDays(7), 5],
    ]);
    const res = await adminCall(variantId, {
      quantity: 10,
      reason: 'restock',
      bestBefore: inDays(30),
    });
    expect(res.status).toBe(200);
    expect(await quantities(variantId)).toEqual([
      [inDays(2), 3],
      [inDays(7), 5],
      [inDays(30), 2],
    ]);
    await expectBatchInvariant();
  });

  it('a decrease takes the oldest packs first', async () => {
    const variantId = await food([
      { bestBefore: inDays(9), quantity: 5 },
      { bestBefore: inDays(2), quantity: 3 },
      { bestBefore: null, quantity: 2 },
    ]);
    expect((await adminCall(variantId, { quantity: 6, reason: 'damage' })).status).toBe(200);
    expect(await quantities(variantId)).toEqual([
      [inDays(2), 0],
      [inDays(9), 4],
      [null, 2],
    ]);
    await expectBatchInvariant();
  });
});

describe('returns', () => {
  it('household goods go back on the shelf, undated; food is refunded and written off', async () => {
    const goods = await deliveredOrder(app, { quantity: 2, stock: 10 });
    const [goodsLine] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, (await orderByNumber(goods.number)).id));
    expect(goodsLine).toBeDefined();
    const { shopper: admin } = await signedIn(app, 'admin', 'boss@grocery.test');

    const ret = await goods.buyer.shopper.call('post', `/orders/${goods.number}/returns`, {
      reason: 'wrong_size',
      items: [{ orderItemId: goodsLine!.id, quantity: 2 }],
    });
    const id = (ret.body as { data: { id: string } }).data.id;
    await admin.call('post', `/admin/returns/${id}/approve`, {});
    await admin.call('post', `/admin/returns/${id}/receive`, {});
    expect(await stockOf(goods.variantId)).toEqual({ quantity: 10, reserved: 0 });
    await expectBatchInvariant();

    // The same flow for a food product: nothing goes back.
    const foodProduct = await createProduct({ shelfLifeDays: 5, variants: [{ priceCents: 400 }] });
    const foodVariant = foodProduct.variants[0]!.id;
    const buyer = await signedIn(app, 'customer', 'food@grocery.test');
    const placed = await placeOrder(app, {
      variantId: foodVariant,
      quantity: 2,
      shopper: buyer.shopper,
      email: buyer.user.email,
    });
    await simulate(app, placed.number);
    const { markDelivered } = await import('../../test/orders.ts');
    await markDelivered(placed.number);
    const [foodLine] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, (await orderByNumber(placed.number)).id));
    const r2 = await buyer.shopper.call('post', `/orders/${placed.number}/returns`, {
      reason: 'wrong_size',
      items: [{ orderItemId: foodLine!.id, quantity: 2 }],
    });
    const id2 = (r2.body as { data: { id: string } }).data.id;
    await admin.call('post', `/admin/returns/${id2}/approve`, {});
    const received = await admin.call('post', `/admin/returns/${id2}/receive`, {});
    expect(received.status).toBe(200);
    expect(await stockOf(foodVariant)).toEqual({ quantity: 48, reserved: 0 });
    const adj = await db
      .select()
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.variantId, foodVariant));
    expect(adj).toMatchObject([{ delta: 0, reason: 'written_off_return' }]);
    await expectBatchInvariant();
  });
});

describe('the write-off-expired job', () => {
  it('zeroes expired batches, lowers the stock row and records an expired adjustment', async () => {
    const variantId = await food([
      { bestBefore: addDays(today, -3), quantity: 2 },
      { bestBefore: addDays(today, -1), quantity: 1 },
      { bestBefore: today, quantity: 4 }, // good on its best-before day
      { bestBefore: inDays(5), quantity: 6 },
    ]);
    const outcome = await runJob('write-off-expired', { now: new Date(), log, gateway: fake });
    expect(outcome).toMatchObject({ status: 'ran', result: { units: 3, batches: 2, heldBack: 0 } });
    expect(await quantities(variantId)).toEqual([
      [addDays(today, -3), 0],
      [addDays(today, -1), 0],
      [today, 4],
      [inDays(5), 6],
    ]);
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
    const adj = await db
      .select()
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.variantId, variantId));
    expect(adj).toMatchObject([{ delta: -3, reason: 'expired', actor: 'system:job' }]);
    await expectBatchInvariant();
  });

  it('leaves units that an unpaid order holds, and writes them off on a later run', async () => {
    const variantId = await food([
      { bestBefore: addDays(today, -1), quantity: 3 },
      { bestBefore: inDays(5), quantity: 1 },
    ]);
    await db
      .update(inventory)
      .set({ reserved: 3 })
      .where(and(eq(inventory.variantId, variantId), eq(inventory.storeId, DEFAULT_STORE_ID)));
    const first = await db.transaction((tx) => writeOffExpired(tx));
    expect(first).toEqual({ batches: 1, units: 1, heldBack: 2 });
    await expectBatchInvariant();
    expect((await stockOf(variantId)).quantity).toBe(3);
    await db.update(inventory).set({ reserved: 0 }).where(eq(inventory.variantId, variantId));
    const second = await db.transaction((tx) => writeOffExpired(tx));
    expect(second.units).toBe(2);
    await expectBatchInvariant();
  });

  it('does nothing when nothing is expired, and is idempotent in a period', async () => {
    await food([{ bestBefore: inDays(5), quantity: 6 }]);
    const ctx = { now: new Date(), log, gateway: fake };
    expect(await runJob('write-off-expired', ctx)).toMatchObject({
      status: 'ran',
      result: { units: 0 },
    });
    expect((await runJob('write-off-expired', ctx)).status).toBe('skipped');
    await expectBatchInvariant();
  });
});
