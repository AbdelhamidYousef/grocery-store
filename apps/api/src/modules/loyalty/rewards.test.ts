import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { discountCodes, orders, pointsLedger, rewards } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { orderByNumber, signedIn, simulate, TEST_ADDRESS } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';

import * as repo from './repo.ts';

let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  app = makeTestApp();
  await createShippingMethods();
});

const seedRewards = () =>
  db
    .insert(rewards)
    .values([
      { name: 'EUR 10', costPoints: 950, kind: 'coupon_fixed', valueCents: 1000 },
      { name: 'EUR 5', costPoints: 500, kind: 'coupon_fixed', valueCents: 500 },
      { name: 'Free delivery', costPoints: 300, kind: 'free_shipping', valueCents: 0 },
      { name: 'Retired', costPoints: 100, kind: 'coupon_fixed', valueCents: 100, active: false },
    ])
    .returning();

const give = (userId: string, points: number) =>
  db
    .insert(pointsLedger)
    .values({ userId, delta: points, kind: 'bonus', refKey: `seed:${points}` });

interface Redeemed {
  data: {
    code: { code: string; kind: string; value: number; endsAt: string | null };
    balance: number;
  };
}

describe('GET /rewards', () => {
  it('is public, lists only active rewards, cheapest first', async () => {
    await seedRewards();
    const res = await makeShopper(app).call('get', '/rewards');
    expect(res.status).toBe(200);
    const names = bodyOf<{ data: { name: string }[] }>(res).data.map((r) => r.name);
    expect(names).toEqual(['Free delivery', 'EUR 5', 'EUR 10']);
  });
});

describe('POST /me/rewards/:id/redeem', () => {
  it('debits the points and mints a personal single-use code that lasts 60 days', async () => {
    const [ten, five] = await seedRewards();
    void ten;
    const c = await signedIn(app);
    await give(c.user.id, 700);
    const res = await c.shopper.call('post', `/me/rewards/${five!.id}/redeem`);
    expect(res.status).toBe(201);
    const { code, balance } = bodyOf<Redeemed>(res).data;
    expect(balance).toBe(200);
    expect(code).toMatchObject({ kind: 'fixed', value: 500 });
    const [row] = await db.select().from(discountCodes).where(eq(discountCodes.code, code.code));
    expect(row).toMatchObject({ ownerUserId: c.user.id, maxUses: 1, active: true });
    const days = (row!.endsAt!.getTime() - row!.startsAt!.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(60);
    const [entry] = await db.select().from(pointsLedger).where(eq(pointsLedger.kind, 'redeem'));
    expect(entry).toMatchObject({ delta: -500, orderId: null });
    expect(await repo.standing(db, c.user.id)).toMatchObject({ balance: 200 });
  });

  it('refuses without enough points, for an inactive reward, and for a guest', async () => {
    const all = await seedRewards();
    const c = await signedIn(app);
    await give(c.user.id, 400);
    const five = all.find((r) => r.name === 'EUR 5')!;
    const short = await c.shopper.call('post', `/me/rewards/${five.id}/redeem`);
    expect(short.status).toBe(409);
    expect(errorOf(short).message).toContain('You need 500 points');
    expect(await repo.standing(db, c.user.id)).toMatchObject({ balance: 400 });
    expect(await db.select().from(discountCodes)).toHaveLength(0);

    const retired = all.find((r) => r.name === 'Retired')!;
    expect((await c.shopper.call('post', `/me/rewards/${retired.id}/redeem`)).status).toBe(404);
    expect((await makeShopper(app).call('post', `/me/rewards/${five.id}/redeem`)).status).toBe(401);
  });

  it('two parallel redemptions of the same points cannot both succeed', async () => {
    const all = await seedRewards();
    const five = all.find((r) => r.name === 'EUR 5')!;
    const c = await signedIn(app);
    await give(c.user.id, 600);
    const results = await Promise.all([
      c.shopper.call('post', `/me/rewards/${five.id}/redeem`),
      c.shopper.call('post', `/me/rewards/${five.id}/redeem`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await repo.standing(db, c.user.id)).balance).toBe(100);
  });

  it('lists my codes, newest first, with whether each was used', async () => {
    const five = (await seedRewards()).find((r) => r.name === 'EUR 5')!;
    const c = await signedIn(app);
    await give(c.user.id, 1000);
    await c.shopper.call('post', `/me/rewards/${five.id}/redeem`);
    const res = await c.shopper.call('get', '/me/codes');
    const list = bodyOf<{ data: { code: string; used: boolean }[] }>(res).data;
    expect(list).toHaveLength(1);
    expect(list[0]!.used).toBe(false);
  });
});

describe('a reward code at checkout', () => {
  async function cartWithCode(owner: Awaited<ReturnType<typeof signedIn>>, code: string) {
    const { variants } = await createProduct({ variants: [{ priceCents: 3000 }] });
    await owner.shopper.addToCart(variants[0]!.id, 1);
    return owner.shopper.call('post', '/cart/code', { code });
  }
  const pay = (shopper: ReturnType<typeof makeShopper>) =>
    shopper.call('post', '/checkout', {
      email: 'ada@pawsome.test',
      shippingAddress: TEST_ADDRESS,
      shippingMethodCode: 'standard',
    });

  it('works for its owner through the engine, once; nobody else can use it', async () => {
    const five = (await seedRewards()).find((r) => r.name === 'EUR 5')!;
    const owner = await signedIn(app);
    await give(owner.user.id, 500);
    const code = bodyOf<Redeemed>(await owner.shopper.call('post', `/me/rewards/${five.id}/redeem`))
      .data.code.code;

    // someone else: the code does not exist for them
    const other = await signedIn(app);
    const refused = await cartWithCode(other, code);
    expect(refused.status).toBe(400);
    expect(errorOf(refused).message).toContain("We don't recognise the code");

    // the owner: EUR 5 off a EUR 30 basket
    expect((await cartWithCode(owner, code)).status).toBe(200);
    const placed = await pay(owner.shopper);
    expect(placed.status).toBe(200);
    const number = bodyOf<{ data: { orderNumber: string } }>(placed).data.orderNumber;
    expect((await orderByNumber(number)).discountCents).toBe(500);
    await simulate(app, number).expect(200);

    // second use: spent
    const { variants } = await createProduct({ variants: [{ priceCents: 3000 }] });
    await owner.shopper.addToCart(variants[0]!.id, 1);
    const again = await owner.shopper.call('post', '/cart/code', { code });
    expect(again.status).toBe(400);
    expect(await db.select().from(orders)).toHaveLength(1);
  });
});

describe('admin rewards', () => {
  const input = { name: 'Toy', costPoints: 600, kind: 'gift', valueCents: 699 };

  it('is admin only', async () => {
    const c = await signedIn(app);
    expect((await c.shopper.call('get', '/admin/rewards')).status).toBe(403);
    expect((await c.shopper.call('post', '/admin/rewards', input)).status).toBe(403);
  });

  it('creates, updates and deletes a reward', async () => {
    const admin = await signedIn(app, 'admin');
    const created = await admin.shopper.call('post', '/admin/rewards', input);
    expect(created.status).toBe(201);
    const id = bodyOf<{ data: { id: string; active: boolean } }>(created).data.id;
    const put = await admin.shopper.call('put', `/admin/rewards/${id}`, {
      ...input,
      costPoints: 650,
      active: false,
    });
    expect(bodyOf<{ data: { costPoints: number; active: boolean } }>(put).data).toMatchObject({
      costPoints: 650,
      active: false,
    });
    const publicList = await makeShopper(app).call('get', '/rewards');
    expect(bodyOf<{ data: unknown[] }>(publicList).data).toHaveLength(0);
    expect((await admin.shopper.call('delete', `/admin/rewards/${id}`)).status).toBe(204);
    expect((await admin.shopper.call('delete', `/admin/rewards/${id}`)).status).toBe(404);
  });

  it('rejects a value on free shipping and no value on money rewards', async () => {
    const admin = await signedIn(app, 'admin');
    const bad = [
      { ...input, kind: 'free_shipping', valueCents: 100 },
      { ...input, kind: 'coupon_fixed', valueCents: 0 },
      { ...input, costPoints: 0 },
    ];
    for (const body of bad) {
      expect((await admin.shopper.call('post', '/admin/rewards', body)).status).toBe(400);
    }
  });
});
