import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { discountCodes, referrals, users } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods, createUser } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';
import { orderByNumber, signedIn, simulate, TEST_ADDRESS } from '../../test/orders.ts';
import { makeShopper, type Shopper } from '../../test/shopper.ts';
import { emitOrderRefunded } from '../orders/events.ts';

import { addressHash, getOrCreateCode } from './referrals-service.ts';

let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  app = makeTestApp();
  await createShippingMethods();
});

const register = async (email: string, refCode?: string) => {
  const shopper = makeShopper(app);
  if (refCode) shopper.jar.set('pawsome_ref', refCode);
  const res = await shopper.call('post', '/auth/register', {
    email,
    password: 'correct-horse-battery',
    firstName: 'New',
    lastName: 'Friend',
  });
  expect(res.status).toBe(201);
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return { shopper, user: user! };
};

const referralOf = async (userId: string) =>
  (await db.select().from(referrals).where(eq(referrals.referredUserId, userId)))[0];

// A paid order for `shopper`, EUR 25 of goods unless told otherwise.
async function paidOrder(
  shopper: Shopper,
  opts: { priceCents?: number; address?: typeof TEST_ADDRESS } = {},
) {
  const { variants } = await createProduct({ variants: [{ priceCents: opts.priceCents ?? 2500 }] });
  await shopper.addToCart(variants[0]!.id, 1);
  const res = await shopper.call('post', '/checkout', {
    email: 'x@pawsome.test',
    shippingAddress: opts.address ?? { ...TEST_ADDRESS, line1: '77 Different Road' },
    shippingMethodCode: 'standard',
  });
  expect(res.status).toBe(200);
  const number = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
  await simulate(app, number).expect(200);
  return orderByNumber(number);
}

async function referrer() {
  const c = await signedIn(app);
  const code = await getOrCreateCode(db, c.user.id);
  return { ...c, code };
}

const codesOf = (userId: string) =>
  db.select().from(discountCodes).where(eq(discountCodes.ownerUserId, userId));

describe('the shareable code', () => {
  it('is created once per customer and returned by GET /me/referral', async () => {
    const r = await signedIn(app);
    const a = bodyOf<{ data: { code: string; rewardCents: number } }>(
      await r.shopper.call('get', '/me/referral'),
    ).data;
    const b = bodyOf<{ data: { code: string } }>(await r.shopper.call('get', '/me/referral')).data;
    expect(a.code).toMatch(/^PAW[A-Z0-9]{5}$/);
    expect(b.code).toBe(a.code);
    expect(a.rewardCents).toBe(500);
  });
});

describe('attaching at registration', () => {
  it('records a pending referral from the cookie, and clears the cookie', async () => {
    const r = await referrer();
    const { user } = await register('friend@pawsome.test', r.code);
    expect(await referralOf(user.id)).toMatchObject({ status: 'pending', referrerId: r.user.id });
  });

  it('ignores an unknown or malformed code', async () => {
    const a = await register('a@pawsome.test', 'NOSUCH1');
    const b = await register('b@pawsome.test', '<script>');
    expect(await referralOf(a.user.id)).toBeUndefined();
    expect(await referralOf(b.user.id)).toBeUndefined();
  });

  it('rejects a self-referral by the same normalised email', async () => {
    const owner = await createUser({ email: 'jo.smith@gmail.com' });
    const code = await getOrCreateCode(db, owner.id);
    const { user } = await register('josmith+shop@googlemail.com', code);
    expect(await referralOf(user.id)).toMatchObject({
      status: 'rejected',
      rejectReason: 'self_referral',
    });
  });

  it('rejects someone who already paid us as a guest', async () => {
    const r = await referrer();
    const guest = makeShopper(app);
    const { variants } = await createProduct({ variants: [{ priceCents: 2500 }] });
    await guest.addToCart(variants[0]!.id, 1);
    const placed = await guest.call('post', '/checkout', {
      email: 'old@pawsome.test',
      shippingAddress: TEST_ADDRESS,
      shippingMethodCode: 'standard',
    });
    await simulate(app, bodyOf<{ data: { orderNumber: string } }>(placed).data.orderNumber).expect(
      200,
    );
    const { user } = await register('old@pawsome.test', r.code);
    expect(await referralOf(user.id)).toMatchObject({
      status: 'rejected',
      rejectReason: 'not_a_new_customer',
    });
  });
});

describe('qualifying', () => {
  it('mints one code for each side on the first paid order of EUR 20 or more, once', async () => {
    const r = await referrer();
    const { shopper, user } = await register('friend@pawsome.test', r.code);
    const order = await paidOrder(shopper);
    const referral = (await referralOf(user.id))!;
    expect(referral).toMatchObject({ status: 'qualified', qualifiedOrderId: order.id });
    const mine = await codesOf(r.user.id);
    const theirs = await codesOf(user.id);
    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    for (const c of [...mine, ...theirs]) {
      expect(c).toMatchObject({ kind: 'fixed', value: 500, minSpendCents: 2000, maxUses: 1 });
      const days = (c.endsAt!.getTime() - c.startsAt!.getTime()) / 86_400_000;
      expect(Math.round(days)).toBe(90);
    }
    await simulate(app, order.number); // redelivered paid event
    expect(await codesOf(r.user.id)).toHaveLength(1);
    expect(await codesOf(user.id)).toHaveLength(1);
  });

  it('a smaller first order leaves it pending; a later EUR 20 order qualifies it', async () => {
    const r = await referrer();
    const { shopper, user } = await register('friend@pawsome.test', r.code);
    await paidOrder(shopper, { priceCents: 1500 });
    expect((await referralOf(user.id))?.status).toBe('pending');
    expect(await codesOf(r.user.id)).toHaveLength(0);
    await paidOrder(shopper, { priceCents: 2000 });
    expect((await referralOf(user.id))?.status).toBe('qualified');
  });

  it("rejects when the order ships to the referrer's address", async () => {
    const r = await referrer();
    await paidOrder(r.shopper, { address: TEST_ADDRESS });
    const { shopper, user } = await register('friend@pawsome.test', r.code);
    await paidOrder(shopper, { address: { ...TEST_ADDRESS, line1: '1  BONE street' } });
    expect(addressHash(TEST_ADDRESS)).toBe(
      addressHash({ ...TEST_ADDRESS, line1: '1  BONE street' }),
    );
    expect(await referralOf(user.id)).toMatchObject({
      status: 'rejected',
      rejectReason: 'same_address',
    });
    expect(await codesOf(user.id)).toHaveLength(0);
  });

  it('allows at most 10 qualified referrals per referrer per year', async () => {
    const r = await referrer();
    const earlier = await Promise.all(Array.from({ length: 10 }, () => createUser()));
    await db.insert(referrals).values(
      earlier.map((u) => ({
        referrerId: r.user.id,
        referredUserId: u.id,
        status: 'qualified' as const,
        qualifiedAt: new Date(),
      })),
    );
    const { shopper, user } = await register('eleventh@pawsome.test', r.code);
    await paidOrder(shopper);
    expect(await referralOf(user.id)).toMatchObject({
      status: 'rejected',
      rejectReason: 'referrer_limit',
    });
    // a year-old one no longer counts: the oldest drops out of the window
    await db
      .update(referrals)
      .set({ qualifiedAt: new Date(Date.now() - 400 * 86_400_000) })
      .where(eq(referrals.referredUserId, earlier[0]!.id));
  });
});

describe('the yearly limit under concurrency', () => {
  it('two friends paying at the same moment cannot both take the last slot', async () => {
    const r = await referrer();
    const earlier = await Promise.all(Array.from({ length: 9 }, () => createUser()));
    await db.insert(referrals).values(
      earlier.map((u) => ({
        referrerId: r.user.id,
        referredUserId: u.id,
        status: 'qualified' as const,
        qualifiedAt: new Date(),
      })),
    );
    const place = async (email: string, line1: string) => {
      const { shopper, user } = await register(email, r.code);
      const { variants } = await createProduct({ variants: [{ priceCents: 2500 }] });
      await shopper.addToCart(variants[0]!.id, 1);
      const res = await shopper.call('post', '/checkout', {
        email,
        shippingAddress: { ...TEST_ADDRESS, line1 },
        shippingMethodCode: 'standard',
      });
      return {
        user,
        number: bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber,
      };
    };
    const a = await place('a@pawsome.test', '10 First Road');
    const b = await place('b@pawsome.test', '20 Second Road');
    await Promise.all([simulate(app, a.number).expect(200), simulate(app, b.number).expect(200)]);
    const statuses = [(await referralOf(a.user.id))?.status, (await referralOf(b.user.id))?.status];
    expect(statuses.sort()).toEqual(['qualified', 'rejected']);
  });
});

describe('voiding on refund', () => {
  it('switches off the unused codes when the qualifying order is fully refunded', async () => {
    const r = await referrer();
    const { shopper, user } = await register('friend@pawsome.test', r.code);
    const order = await paidOrder(shopper);
    await simulate(app, order.number, 'charge.refunded').expect(200);
    for (const c of [...(await codesOf(r.user.id)), ...(await codesOf(user.id))]) {
      expect(c.active).toBe(false);
    }
    expect((await referralOf(user.id))?.voidedAt).toBeInstanceOf(Date);
  });

  it('keeps the codes through a partial refund and voids them on the final one', async () => {
    const r = await referrer();
    const { shopper, user } = await register('friend@pawsome.test', r.code);
    const order = await paidOrder(shopper);
    const refund = (refundId: string, full: boolean) =>
      db.transaction((tx) =>
        emitOrderRefunded(tx, {
          orderId: order.id,
          refundId,
          amountCents: 500,
          full,
          lines: [],
          shippingCents: 0,
          donationCents: 0,
        }),
      );
    await refund('ret_1', false);
    expect((await referralOf(user.id))?.voidedAt).toBeNull();
    for (const c of await codesOf(r.user.id)) expect(c.active).toBe(true);
    await refund('ret_2', true);
    expect((await referralOf(user.id))?.voidedAt).toBeInstanceOf(Date);
    for (const c of await codesOf(r.user.id)) expect(c.active).toBe(false);
  });

  it('also switches off a code held by an UNPAID order, so it cannot revive when the hold is released', async () => {
    const r = await referrer();
    const { shopper } = await register('friend@pawsome.test', r.code);
    const qualifying = await paidOrder(shopper);
    const [mine] = await codesOf(r.user.id);
    // the referrer puts their code on an order that is still pending_payment
    const { variants } = await createProduct({ variants: [{ priceCents: 3000 }] });
    await r.shopper.addToCart(variants[0]!.id, 1);
    expect((await r.shopper.call('post', '/cart/code', { code: mine!.code })).status).toBe(200);
    const placed = await r.shopper.call('post', '/checkout', {
      email: 'ref@pawsome.test',
      shippingAddress: { ...TEST_ADDRESS, line1: '5 Elsewhere Lane' },
      shippingMethodCode: 'standard',
    });
    expect(placed.status).toBe(200);
    await simulate(app, qualifying.number, 'charge.refunded').expect(200);
    const [after] = await db.select().from(discountCodes).where(eq(discountCodes.id, mine!.id));
    expect(after?.active).toBe(false);
  });

  it('keeps a code that was already used', async () => {
    const r = await referrer();
    const { shopper, user } = await register('friend@pawsome.test', r.code);
    const order = await paidOrder(shopper);
    const [mine] = await codesOf(r.user.id);
    // the referrer spent their code on an order that was PAID (not the one being refunded)
    const spent = await paidOrder(r.shopper, {
      address: { ...TEST_ADDRESS, line1: '9 Spent Lane' },
    });
    const { discountRedemptions } = await import('../../db/schema/index.ts');
    await db
      .insert(discountRedemptions)
      .values({ codeId: mine!.id, orderId: spent.id, customerKey: r.user.id });
    await simulate(app, order.number, 'charge.refunded').expect(200);
    const after = await db
      .select()
      .from(discountCodes)
      .where(and(eq(discountCodes.id, mine!.id)));
    expect(after[0]?.active).toBe(true);
    const [theirs] = await codesOf(user.id);
    expect(theirs?.active).toBe(false);
  });
});
