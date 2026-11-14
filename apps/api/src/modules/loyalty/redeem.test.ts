import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { orderPromotions, orders, pointsLedger } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { orderByNumber, signedIn, simulate, TEST_ADDRESS } from '../../test/orders.ts';
import { makeShopper, type Shopper } from '../../test/shopper.ts';
import { cancelPendingOrder } from '../checkout/orders.ts';
import { emitOrderRefunded } from '../orders/events.ts';

import * as repo from './repo.ts';
import { assertCanRedeem, recordRedemption } from './service.ts';

let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  app = makeTestApp();
  await createShippingMethods();
});

const give = (userId: string, points: number, key = `seed:${points}`) =>
  db.insert(pointsLedger).values({ userId, delta: points, kind: 'bonus', refKey: key });

const balanceOf = async (userId: string) => (await repo.standing(db, userId)).balance;

async function variant(priceCents: number) {
  const { variants } = await createProduct({ variants: [{ priceCents, weightGrams: 200 }] });
  return variants[0]!.id;
}

const checkout = (shopper: Shopper, extra: object = {}) =>
  shopper.call('post', '/checkout', {
    email: 'ada@pawsome.test',
    shippingAddress: TEST_ADDRESS,
    shippingMethodCode: 'standard',
    ...extra,
  });

async function customerCart(priceCents = 1000, quantity = 2) {
  const c = await signedIn(app);
  await c.shopper.addToCart(await variant(priceCents), quantity);
  return c;
}

const numberOf = (res: Awaited<ReturnType<typeof checkout>>) =>
  bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;

describe('redeeming points at checkout', () => {
  it('takes the points off the merchandise through the engine and writes one redeem row', async () => {
    const c = await customerCart(); // 20.00 merchandise
    await give(c.user.id, 1000);
    const res = await checkout(c.shopper, { pointsToRedeem: 500 });
    expect(res.status).toBe(200);
    const order = await orderByNumber(numberOf(res));
    expect(order).toMatchObject({ subtotalCents: 2000, discountCents: 500 });
    expect(order.totalCents).toBe(1500 + order.shippingCents);
    const [credit] = await db
      .select()
      .from(orderPromotions)
      .where(eq(orderPromotions.orderId, order.id));
    expect(credit).toMatchObject({ type: 'credit', cents: 500 });
    const rows = await db.select().from(pointsLedger).where(eq(pointsLedger.kind, 'redeem'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ delta: -500, orderId: order.id });
    expect(await balanceOf(c.user.id)).toBe(500);
  });

  it('caps the points at the merchandise left and never touches shipping', async () => {
    const c = await customerCart(500, 1); // 5.00 merchandise
    await give(c.user.id, 5000);
    const res = await checkout(c.shopper, { pointsToRedeem: 5000 });
    const order = await orderByNumber(numberOf(res));
    expect(order.discountCents).toBe(500);
    expect(order.shippingCents).toBeGreaterThan(0);
    expect(order.totalCents).toBe(order.shippingCents);
    // only what was applied is spent
    expect(await balanceOf(c.user.id)).toBe(4500);
  });

  it('refuses more points than the balance, and a guest, without creating an order', async () => {
    const c = await customerCart();
    await give(c.user.id, 100);
    const res = await checkout(c.shopper, { pointsToRedeem: 101 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(errorOf(res).details)).toContain('You have 100 points');
    expect(await db.select().from(orders)).toHaveLength(0);

    const guest = makeShopper(app);
    await guest.addToCart(await variant(1000));
    expect((await checkout(guest, { pointsToRedeem: 10 })).status).toBe(400);
  });

  it('placing the same cart again rewrites the redemption instead of spending twice', async () => {
    const c = await customerCart();
    await give(c.user.id, 1000);
    await checkout(c.shopper, { pointsToRedeem: 800 });
    expect(await balanceOf(c.user.id)).toBe(200);
    // changes mind: 300 points (the 800 held by this very order are available again)
    const res = await checkout(c.shopper, { pointsToRedeem: 300 });
    expect(res.status).toBe(200);
    expect(await balanceOf(c.user.id)).toBe(700);
    // and then none
    await checkout(c.shopper, {});
    expect(await balanceOf(c.user.id)).toBe(1000);
    expect(
      await db.select().from(pointsLedger).where(eq(pointsLedger.kind, 'redeem')),
    ).toHaveLength(0);
  });

  it('two parallel spends of the same points cannot both succeed', async () => {
    const c = await signedIn(app);
    await give(c.user.id, 1000);
    // two real orders to hang the redemptions on
    const ids: string[] = [];
    for (const n of [1, 2]) {
      const g = makeShopper(app);
      await g.addToCart(await variant(2000));
      const res = await checkout(g, { email: `guest${n}@pawsome.test` });
      ids.push((await orderByNumber(numberOf(res))).id);
    }
    const spend = (orderId: string) =>
      db.transaction(async (tx) => {
        await assertCanRedeem(tx, c.user.id, 800);
        await recordRedemption(tx, c.user.id, orderId, 800);
      });
    const results = await Promise.allSettled(ids.map(spend));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await balanceOf(c.user.id)).toBe(200);
  });
});

describe('reversal', () => {
  it('a cancelled or failed payment gives the points back', async () => {
    const c = await customerCart();
    await give(c.user.id, 1000);
    const order = await orderByNumber(numberOf(await checkout(c.shopper, { pointsToRedeem: 600 })));
    expect(await balanceOf(c.user.id)).toBe(400);
    await db.transaction((tx) =>
      cancelPendingOrder(tx, order.id, { actor: 'test', note: 'payment failed' }),
    );
    expect(await balanceOf(c.user.id)).toBe(1000);
    // the history keeps both rows: nothing was edited
    const rows = await db.select().from(pointsLedger).where(eq(pointsLedger.orderId, order.id));
    expect(rows.map((r) => [r.kind, r.delta]).sort()).toEqual([
      ['redeem', -600],
      ['reversal', 600],
    ]);
  });

  it('a refunded paid order takes back what it earned and returns what it spent', async () => {
    const c = await customerCart(); // 20.00
    await give(c.user.id, 1000);
    const order = await orderByNumber(numberOf(await checkout(c.shopper, { pointsToRedeem: 500 })));
    await simulate(app, order.number).expect(200);
    // earned on 15.00 paid merchandise at the Good Dog rate (1000 lifetime points): 18; balance 500 + 18
    expect(await balanceOf(c.user.id)).toBe(518);
    await simulate(app, order.number, 'charge.refunded').expect(200);
    // -18 earned, +500 returned
    expect(await balanceOf(c.user.id)).toBe(1000);
    // replaying the refund changes nothing
    await simulate(app, order.number, 'charge.refunded');
    expect(await balanceOf(c.user.id)).toBe(1000);
  });

  it('never pushes a balance below zero by clawing back points that were already spent', async () => {
    const c = await customerCart(); // 20.00 -> 20 points
    const order = await orderByNumber(numberOf(await checkout(c.shopper)));
    await simulate(app, order.number).expect(200);
    expect(await balanceOf(c.user.id)).toBe(20);
    await db
      .insert(pointsLedger)
      .values({ userId: c.user.id, delta: -15, kind: 'adjust', refKey: 'spent' });
    await simulate(app, order.number, 'charge.refunded').expect(200);
    // only the 5 left could be taken back
    expect(await balanceOf(c.user.id)).toBe(0);
  });

  it('a partial refund reverses in proportion, once per refund id', async () => {
    const c = await customerCart(); // 20.00 -> 20 points
    const order = await orderByNumber(numberOf(await checkout(c.shopper)));
    await simulate(app, order.number).expect(200);
    const refund = () =>
      db.transaction((tx) =>
        emitOrderRefunded(tx, {
          orderId: order.id,
          refundedCents: Math.floor(order.totalCents / 4),
          full: false,
          refundId: 're_1',
        }),
      );
    await refund();
    const after = await balanceOf(c.user.id);
    expect(after).toBeLessThan(20);
    expect(after).toBeGreaterThanOrEqual(14); // about a quarter of 20 taken back
    await refund(); // same refund id again
    expect(await balanceOf(c.user.id)).toBe(after);
  });
});
