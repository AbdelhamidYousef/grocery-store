import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { pointsLedger } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createShippingMethods } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';
import { orderByNumber, placeOrder, signedIn, simulate } from '../../test/orders.ts';
import { makeShopper, type Shopper } from '../../test/shopper.ts';

import { awardForOrder } from './service.ts';

let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  app = makeTestApp();
  await createShippingMethods();
});

interface Summary {
  data: {
    balance: number;
    lifetimeEarned: number;
    tier: { id: string };
    nextTier: { id: string; pointsNeeded: number } | null;
    entries: { delta: number; kind: string; orderNumber: string | null }[];
  };
}

const summary = async (shopper: Shopper) =>
  bodyOf<Summary>(await shopper.call('get', '/me/points')).data;

async function paidOrder(
  customer: Awaited<ReturnType<typeof signedIn>>,
  opts: { priceCents?: number; quantity?: number } = {},
) {
  const { number } = await placeOrder(app, {
    shopper: customer.shopper,
    priceCents: opts.priceCents ?? 1250,
    quantity: opts.quantity ?? 2,
  });
  await simulate(app, number).expect(200);
  return orderByNumber(number);
}

describe('earning points', () => {
  it('awards 1 point per whole euro of merchandise when the order is paid, not for shipping', async () => {
    const customer = await signedIn(app);
    // 2 x 12.50 = 25.00 merchandise (+ shipping that earns nothing)
    const order = await paidOrder(customer);
    expect(order.shippingCents).toBeGreaterThan(0);
    const me = await summary(customer.shopper);
    expect(me.balance).toBe(25);
    expect(me.tier.id).toBe('pup');
    expect(me.entries).toEqual([
      expect.objectContaining({ delta: 25, kind: 'earn', orderNumber: order.number }),
    ]);
  });

  it('awards nothing for a pending order, and nothing to a guest', async () => {
    const customer = await signedIn(app);
    await placeOrder(app, { shopper: customer.shopper });
    expect((await summary(customer.shopper)).balance).toBe(0);

    const { number } = await placeOrder(app, {});
    await simulate(app, number).expect(200);
    expect(await db.select().from(pointsLedger)).toHaveLength(0);
  });

  it('a second paid event for the same order awards once', async () => {
    const customer = await signedIn(app);
    const order = await paidOrder(customer);
    const again = await db.transaction((tx) => awardForOrder(tx, order.id));
    expect(again).toBe(0);
    await simulate(app, order.number); // a redelivered webhook
    expect(await db.select().from(pointsLedger)).toHaveLength(1);
  });

  it('uses the tier the customer had BEFORE the order', async () => {
    const customer = await signedIn(app);
    await db
      .insert(pointsLedger)
      .values({ userId: customer.user.id, delta: 500, kind: 'bonus', refKey: 'seed:1' });
    const me0 = await summary(customer.shopper);
    expect(me0.tier.id).toBe('good_dog');
    // 100.00 at x1.25 = 125
    await paidOrder(customer, { priceCents: 5000, quantity: 2 });
    const me = await summary(customer.shopper);
    expect(me.balance).toBe(625);
    expect(me.lifetimeEarned).toBe(625);
  });

  it('balance always equals the sum of the ledger, and tier boundaries move with lifetime points', async () => {
    const customer = await signedIn(app);
    const uid = customer.user.id;
    await db.insert(pointsLedger).values([
      { userId: uid, delta: 499, kind: 'bonus', refKey: 'a' },
      { userId: uid, delta: -100, kind: 'redeem', refKey: 'b' },
    ]);
    let me = await summary(customer.shopper);
    expect(me.balance).toBe(399);
    // spending does not lower the tier: it follows what was EARNED
    expect(me).toMatchObject({ lifetimeEarned: 499, tier: { id: 'pup' } });
    expect(me.nextTier).toMatchObject({ id: 'good_dog', pointsNeeded: 1 });
    await db.insert(pointsLedger).values({ userId: uid, delta: 1, kind: 'earn', refKey: 'c' });
    me = await summary(customer.shopper);
    expect(me.tier.id).toBe('good_dog');
    const rows = await db.select().from(pointsLedger).where(eq(pointsLedger.userId, uid));
    expect(me.balance).toBe(rows.reduce((n, r) => n + r.delta, 0));
  });

  it('answers 401 to a guest', async () => {
    const res = await makeShopper(app).call('get', '/me/points');
    expect(res.status).toBe(401);
  });
});

describe('admin adjustments', () => {
  it('adds an adjust row with a reason and can push a balance below zero', async () => {
    const admin = await signedIn(app, 'admin');
    const customer = await signedIn(app);
    const res = await admin.shopper.call('post', '/admin/points/adjust', {
      email: customer.user.email,
      delta: -30,
      reason: 'Goodwill reversed',
    });
    expect(res.status).toBe(201);
    expect(bodyOf<{ data: { balance: number } }>(res).data.balance).toBe(-30);
    const me = await summary(customer.shopper);
    expect(me.balance).toBe(-30);
    expect(me.entries[0]).toMatchObject({ kind: 'adjust', delta: -30 });
  });

  it('is admin only, needs a reason and a known email', async () => {
    const customer = await signedIn(app);
    const admin = await signedIn(app, 'admin');
    const body = { email: customer.user.email, delta: 5, reason: 'Thanks' };
    expect((await customer.shopper.call('post', '/admin/points/adjust', body)).status).toBe(403);
    expect(
      (await admin.shopper.call('post', '/admin/points/adjust', { ...body, reason: '' })).status,
    ).toBe(400);
    expect(
      (await admin.shopper.call('post', '/admin/points/adjust', { ...body, delta: 0 })).status,
    ).toBe(400);
    expect(
      (await admin.shopper.call('post', '/admin/points/adjust', { ...body, email: 'no@one.test' }))
        .status,
    ).toBe(404);
  });
});
