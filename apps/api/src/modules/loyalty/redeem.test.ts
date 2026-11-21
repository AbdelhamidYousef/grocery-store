import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { orderItems, orderPromotions, orders, pointsLedger } from '../../db/schema/index.ts';
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
    email: 'ada@grocery.test',
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
    expect(order.totalCents).toBe(1500 + order.shippingCents + order.bagFeeCents);
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
    const c = await customerCart(1500, 1); // 15.00 merchandise, the minimum order
    await give(c.user.id, 5000);
    const res = await checkout(c.shopper, { pointsToRedeem: 5000 });
    const order = await orderByNumber(numberOf(res));
    expect(order.discountCents).toBe(1500);
    expect(order.shippingCents).toBeGreaterThan(0);
    // The goods are paid with points; delivery and the bag are not.
    expect(order.totalCents).toBe(order.shippingCents + order.bagFeeCents);
    // only what was applied is spent
    expect(await balanceOf(c.user.id)).toBe(3500);
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
      const res = await checkout(g, { email: `guest${n}@grocery.test` });
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

describe('the card minimum', () => {
  it('keeps at least 50 cents payable when the points would cover everything (free delivery)', async () => {
    const c = await customerCart(3000, 2); // 60.00 of goods: free delivery, one bag of 0.25
    await give(c.user.id, 6000);
    const res = await checkout(c.shopper, { pointsToRedeem: 6000 });
    expect(res.status).toBe(200);
    const order = await orderByNumber(numberOf(res));
    expect(order.shippingCents).toBe(0);
    expect(order.totalCents).toBe(50);
    // The points cover the goods up to what leaves 50 cents payable (the bag is 0.25 of them).
    expect(order.discountCents).toBe(5975);
    // only what was applied is spent
    expect(await balanceOf(c.user.id)).toBe(25);
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

  it('returns the redeemed points first, so the earned points can then be taken back from them', async () => {
    const c = await customerCart(); // 20.00
    await give(c.user.id, 500);
    const order = await orderByNumber(numberOf(await checkout(c.shopper, { pointsToRedeem: 500 })));
    await simulate(app, order.number).expect(200);
    const earned = (await balanceOf(c.user.id)) - 0;
    expect(earned).toBeGreaterThan(0);
    // the customer spends everything they earned elsewhere: balance 0
    await db
      .insert(pointsLedger)
      .values({ userId: c.user.id, delta: -earned, kind: 'adjust', refKey: 'spent-elsewhere' });
    await simulate(app, order.number, 'charge.refunded').expect(200);
    // +500 back first, then the earned points come off that: 500 - earned
    expect(await balanceOf(c.user.id)).toBe(500 - earned);
  });

  // A refund event the way the returns service emits it: `units` of the order's one line, with
  // the line's net price share, under its own refund id.
  async function returnRefund(orderId: string, refundId: string, units: number, full = false) {
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const net = line!.lineTotalCents - line!.discountCents;
    const refundCents = Math.floor((net * units) / line!.quantity);
    await db.transaction((tx) =>
      emitOrderRefunded(tx, {
        orderId,
        refundId,
        amountCents: refundCents,
        full,
        lines: [{ orderItemId: line!.id, quantity: units, refundCents }],
        shippingCents: 0,
        donationCents: 0,
      }),
    );
  }

  const ledgerOf = async (orderId: string) =>
    repo.pointsOfOrder(db, orderId).then((p) => ({ given: p.givenBack, clawed: p.clawedBack }));

  it('a partial refund reverses the merchandise share, once per refund id', async () => {
    const c = await customerCart(1000, 4); // 40.00 -> 40 points
    const order = await orderByNumber(numberOf(await checkout(c.shopper)));
    await simulate(app, order.number).expect(200);
    expect(await balanceOf(c.user.id)).toBe(40);
    await returnRefund(order.id, 're_1', 1); // a quarter of the merchandise
    expect(await balanceOf(c.user.id)).toBe(30);
    await returnRefund(order.id, 're_1', 1); // the same refund delivered again
    expect(await balanceOf(c.user.id)).toBe(30);
  });

  it('partial then final refunds give back the redeemed points first and settle exactly', async () => {
    const c = await customerCart(1000, 4); // 40.00
    await give(c.user.id, 1000);
    const order = await orderByNumber(
      numberOf(await checkout(c.shopper, { pointsToRedeem: 1000 })),
    );
    await simulate(app, order.number).expect(200);
    const { earned } = await repo.pointsOfOrder(db, order.id); // on the 30.00 paid in cash
    expect(earned).toBeGreaterThan(0);
    expect(await balanceOf(c.user.id)).toBe(earned);

    // a quarter comes back: 250 redeemed points returned, a quarter of the earned taken back
    await returnRefund(order.id, 're_1', 1);
    expect(await ledgerOf(order.id)).toEqual({ given: 250, clawed: Math.floor(earned / 4) });
    // two more units: three quarters in all
    await returnRefund(order.id, 're_2', 2);
    expect((await ledgerOf(order.id)).given).toBe(750);
    // the last unit makes the order fully refunded: everything left is settled, nothing more
    await returnRefund(order.id, 're_3', 1, true);
    expect(await ledgerOf(order.id)).toEqual({ given: 1000, clawed: earned });
    expect(await balanceOf(c.user.id)).toBe(1000);
    // retries of any of them, and a whole-order refund event afterwards, change nothing
    await returnRefund(order.id, 're_2', 2);
    await returnRefund(order.id, 're_3', 1, true);
    await simulate(app, order.number, 'charge.refunded');
    expect(await balanceOf(c.user.id)).toBe(1000);
    expect(await ledgerOf(order.id)).toEqual({ given: 1000, clawed: earned });
  });

  it('a whole-order refund after a partial one reverses only what is left', async () => {
    const c = await customerCart(1000, 2); // 20.00
    await give(c.user.id, 400);
    const order = await orderByNumber(numberOf(await checkout(c.shopper, { pointsToRedeem: 400 })));
    await simulate(app, order.number).expect(200);
    const { earned } = await repo.pointsOfOrder(db, order.id);
    await returnRefund(order.id, 're_1', 1); // half
    expect(await ledgerOf(order.id)).toEqual({ given: 200, clawed: Math.floor(earned / 2) });
    await db.transaction((tx) =>
      emitOrderRefunded(tx, {
        orderId: order.id,
        refundId: null,
        amountCents: 0,
        full: true,
        lines: [],
        shippingCents: 0,
        donationCents: 0,
      }),
    );
    expect(await ledgerOf(order.id)).toEqual({ given: 400, clawed: earned });
    expect(await balanceOf(c.user.id)).toBe(400);
  });
});
