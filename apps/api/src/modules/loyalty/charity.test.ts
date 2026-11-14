import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { charities, donations, pointsLedger } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { orderByNumber, signedIn, simulate, TEST_ADDRESS } from '../../test/orders.ts';
import { makeShopper, type Shopper } from '../../test/shopper.ts';
import { emitOrderRefunded } from '../orders/events.ts';

import * as repo from './repo.ts';

let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  app = makeTestApp();
  await createShippingMethods();
  await db.insert(charities).values({
    slug: 'whisker-hollow-rescue',
    name: 'Whisker Hollow Rescue',
    description: 'A fictional shelter.',
  });
});

const total = async () =>
  bodyOf<{ data: { totalCents: number; donations: number } }>(
    await makeShopper(app).call('get', '/charity/total'),
  ).data;

async function checkout(shopper: Shopper, priceCents: number, roundUp: boolean) {
  const { variants } = await createProduct({ variants: [{ priceCents }] });
  await shopper.addToCart(variants[0]!.id, 1);
  const res = await shopper.call('post', '/checkout', {
    email: 'ada@pawsome.test',
    shippingAddress: TEST_ADDRESS,
    shippingMethodCode: 'standard',
    roundUpDonation: roundUp,
  });
  expect(res.status).toBe(200);
  return orderByNumber(bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber);
}

// 53.50 is over the 49 EUR free-delivery line, so the payable total is the merchandise alone.
describe('round-up at checkout', () => {
  it('adds the cents up to the next euro as a separate amount in the order total', async () => {
    const order = await checkout(makeShopper(app), 5350, true);
    expect(order).toMatchObject({
      subtotalCents: 5350,
      shippingCents: 0,
      donationCents: 50,
      totalCents: 5400,
    });
  });

  it('adds nothing to a whole-euro total or when the shopper did not tick it', async () => {
    expect((await checkout(makeShopper(app), 5300, true)).donationCents).toBe(0);
    const off = await checkout(makeShopper(app), 5350, false);
    expect(off).toMatchObject({ donationCents: 0, totalCents: 5350 });
  });

  it('is counted when the order is paid, exactly once', async () => {
    const order = await checkout(makeShopper(app), 5350, true);
    expect(await total()).toMatchObject({ totalCents: 0 }); // pending: nothing yet
    await simulate(app, order.number).expect(200);
    await simulate(app, order.number); // redelivered
    expect(await total()).toMatchObject({ totalCents: 50, donations: 1 });
    expect(await db.select().from(donations)).toHaveLength(1);
  });

  it('is reversed when the paid order is refunded, and only once', async () => {
    const order = await checkout(makeShopper(app), 5350, true);
    await simulate(app, order.number).expect(200);
    await simulate(app, order.number, 'charge.refunded').expect(200);
    await simulate(app, order.number, 'charge.refunded');
    expect((await total()).totalCents).toBe(0);
    const rows = await db.select().from(donations);
    expect(rows.map((r) => [r.source, r.cents]).sort()).toEqual([
      ['reversal', -50],
      ['round_up', 50],
    ]);
  });
});

describe('round-up and returns', () => {
  const refund = (orderId: string, refundId: string | null, full: boolean, donationCents: number) =>
    db.transaction((tx) =>
      emitOrderRefunded(tx, {
        orderId,
        refundId,
        amountCents: 100,
        full,
        lines: [],
        shippingCents: 0,
        donationCents,
      }),
    );

  it('stays donated when returns refund every item, since returns never hand it back', async () => {
    const order = await checkout(makeShopper(app), 5350, true);
    await simulate(app, order.number).expect(200);
    await refund(order.id, 'ret_1', false, 0);
    await refund(order.id, 'ret_2', true, 0); // the last return: the order is fully refunded
    expect((await total()).totalCents).toBe(50);
  });

  it('is reversed once by the refund that hands it back', async () => {
    const order = await checkout(makeShopper(app), 5350, true);
    await simulate(app, order.number).expect(200);
    await refund(order.id, 'ret_1', false, 0);
    await refund(order.id, null, true, 50);
    await refund(order.id, null, true, 50); // redelivered
    expect((await total()).totalCents).toBe(0);
    expect(await db.select().from(donations)).toHaveLength(2);
  });
});

describe('donating points', () => {
  const give = (userId: string, points: number) =>
    db
      .insert(pointsLedger)
      .values({ userId, delta: points, kind: 'bonus', refKey: `seed:${points}` });

  it('turns points into cents for the shelter and debits the ledger', async () => {
    const c = await signedIn(app);
    await give(c.user.id, 500);
    const res = await c.shopper.call('post', '/me/points/donate', { points: 200 });
    expect(res.status).toBe(201);
    expect(bodyOf<{ data: { balance: number } }>(res).data.balance).toBe(300);
    expect((await repo.standing(db, c.user.id)).balance).toBe(300);
    expect(await total()).toMatchObject({ totalCents: 200, donations: 1 });
    const [row] = await db.select().from(pointsLedger).where(eq(pointsLedger.kind, 'donate'));
    expect(row?.delta).toBe(-200);
  });

  it('refuses more than the balance, and a guest', async () => {
    const c = await signedIn(app);
    await give(c.user.id, 100);
    const res = await c.shopper.call('post', '/me/points/donate', { points: 101 });
    expect(res.status).toBe(409);
    expect(errorOf(res).message).toContain('You have 100 points');
    expect(await total()).toMatchObject({ totalCents: 0 });
    expect((await makeShopper(app).call('post', '/me/points/donate', { points: 1 })).status).toBe(
      401,
    );
  });

  it('two parallel donations of the same points cannot both succeed', async () => {
    const c = await signedIn(app);
    await give(c.user.id, 150);
    const results = await Promise.all([
      c.shopper.call('post', '/me/points/donate', { points: 100 }),
      c.shopper.call('post', '/me/points/donate', { points: 100 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await repo.standing(db, c.user.id)).balance).toBe(50);
  });
});
