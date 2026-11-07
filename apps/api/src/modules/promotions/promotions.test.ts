import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  bulkTiers,
  discountCodes,
  discountRedemptions,
  giftRules,
  orders,
} from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods, createUser } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { makeShopper } from '../../test/shopper.ts';
import { createSession } from '../auth/sessions.ts';

const app = makeTestApp();

interface PricedBody {
  data: {
    subtotalCents: number;
    pricing: {
      code: string | null;
      discountCents: number;
      merchandiseCents: number;
      shippingEstimateCents: number;
      totalEstimateCents: number;
      adjustments: { type: string; label: string; cents: number }[];
      gift: { variantId: string } | null;
      progress: { gift: { remainingCents: number } | null };
      notices: { key: string }[];
    };
  };
}
const pricingOf = (res: Parameters<typeof bodyOf>[0]) => bodyOf<PricedBody>(res).data.pricing;

async function variant(priceCents: number, extra: { isTrial?: boolean; stock?: number } = {}) {
  const { variants } = await createProduct({ variants: [{ priceCents, ...extra }] });
  return variants[0]!.id;
}

async function code(values: Partial<typeof discountCodes.$inferInsert> & { code: string }) {
  const [row] = await db
    .insert(discountCodes)
    .values({ kind: 'percent', value: 10, ...values })
    .returning();
  return row!;
}

async function placedOrder(email: string, userId: string | null = null) {
  const [row] = await db
    .insert(orders)
    .values({
      userId,
      email,
      status: 'paid',
      subtotalCents: 1000,
      shippingCents: 0,
      totalCents: 1000,
      shippingMethodCode: 'standard',
      shippingMethodName: 'Standard',
      shippingAddress: { fullName: 'A', line1: '1', city: 'Riga', postalCode: '1', country: 'LV' },
    })
    .returning();
  return row!;
}

describe('priced cart', () => {
  it('returns the engine output with a standard-delivery estimate', async () => {
    await createShippingMethods();
    const shop = makeShopper(app);
    await shop.addToCart(await variant(2000));
    const pricing = pricingOf(await shop.call('get', '/cart'));
    expect(pricing.discountCents).toBe(0);
    expect(pricing.merchandiseCents).toBe(2000);
    // 4.90 base + 1 started kg at 1.00, under the 49.00 free threshold
    expect(pricing.shippingEstimateCents).toBe(590);
    expect(pricing.totalEstimateCents).toBe(2590);
  });

  it('applies the best bulk tier without any code', async () => {
    await createShippingMethods();
    await db.insert(bulkTiers).values({ minCents: 5000, percent: 5 });
    const shop = makeShopper(app);
    await shop.addToCart(await variant(6000));
    const pricing = pricingOf(await shop.call('get', '/cart'));
    expect(pricing.discountCents).toBe(300);
    expect(pricing.adjustments.map((a) => a.type)).toEqual(['bulk_tier']);
  });

  it('adds the gift once the threshold is reached and shows what is missing before', async () => {
    await createShippingMethods();
    const giftId = await variant(500);
    await db.insert(giftRules).values({ thresholdCents: 4000, variantId: giftId });
    const shop = makeShopper(app);
    await shop.addToCart(await variant(3800));
    let pricing = pricingOf(await shop.call('get', '/cart'));
    expect(pricing.gift).toBeNull();
    expect(pricing.progress.gift?.remainingCents).toBe(200);

    await shop.addToCart(await variant(200));
    pricing = pricingOf(await shop.call('get', '/cart'));
    expect(pricing.gift?.variantId).toBe(giftId);
  });

  it('gives no gift when the gift is sold out', async () => {
    await createShippingMethods();
    const giftId = await variant(500, { stock: 0 });
    await db.insert(giftRules).values({ thresholdCents: 1000, variantId: giftId });
    const shop = makeShopper(app);
    await shop.addToCart(await variant(2000));
    expect(pricingOf(await shop.call('get', '/cart')).gift).toBeNull();
  });
});

describe('POST /cart/code', () => {
  it('applies a valid code case-insensitively and DELETE removes it', async () => {
    await createShippingMethods();
    await code({ code: 'PAWS10' });
    const shop = makeShopper(app);
    await shop.addToCart(await variant(3000));

    const res = await shop.call('post', '/cart/code', { code: 'paws10' });
    expect(res.status).toBe(200);
    let pricing = pricingOf(res);
    expect(pricing.code).toBe('PAWS10');
    expect(pricing.discountCents).toBe(300);

    pricing = pricingOf(await shop.call('delete', '/cart/code'));
    expect(pricing.code).toBeNull();
    expect(pricing.discountCents).toBe(0);
  });

  it('refuses an unknown or archived code and leaves the cart without it', async () => {
    await createShippingMethods();
    await code({ code: 'OLD', archivedAt: new Date() });
    const shop = makeShopper(app);
    await shop.addToCart(await variant(3000));

    let res = await shop.call('post', '/cart/code', { code: 'NOPE' });
    expect(res.status).toBe(400);
    expect(errorOf(res).message).toBe("We don't recognise the code NOPE");
    res = await shop.call('post', '/cart/code', { code: 'OLD' });
    expect(res.status).toBe(400);
    expect(pricingOf(await shop.call('get', '/cart')).code).toBeNull();
  });

  it('says how much more is needed below the minimum spend', async () => {
    await createShippingMethods();
    await code({ code: 'MIN30', minSpendCents: 3000 });
    const shop = makeShopper(app);
    await shop.addToCart(await variant(1500));
    const res = await shop.call('post', '/cart/code', { code: 'MIN30' });
    expect(res.status).toBe(400);
    expect(errorOf(res).message).toMatch(/^Add .*15\.00 more to use this code$/);
  });

  it('names the expiry date of an expired code', async () => {
    await createShippingMethods();
    await code({
      code: 'GONE',
      startsAt: new Date('2026-09-01T00:00:00Z'),
      endsAt: new Date('2026-10-12T00:00:00Z'),
    });
    const shop = makeShopper(app);
    await shop.addToCart(await variant(3000));
    const res = await shop.call('post', '/cart/code', { code: 'GONE' });
    expect(errorOf(res).message).toBe('This code expired on 12 Oct');
  });

  it('refuses a sale-excluding code when every line is a trial size', async () => {
    await createShippingMethods();
    await code({ code: 'NOSALE', excludeSaleItems: true });
    const shop = makeShopper(app);
    await shop.addToCart(await variant(300, { isTrial: true }));
    const res = await shop.call('post', '/cart/code', { code: 'NOSALE' });
    expect(res.status).toBe(400);
  });

  it('refuses a code whose global cap is used up', async () => {
    await createShippingMethods();
    const capped = await code({ code: 'ONCE', maxUses: 1 });
    const other = await placedOrder('x@x.test');
    await db
      .insert(discountRedemptions)
      .values({ codeId: capped.id, orderId: other.id, customerKey: 'x@x.test' });
    const shop = makeShopper(app);
    await shop.addToCart(await variant(3000));
    const res = await shop.call('post', '/cart/code', { code: 'ONCE' });
    expect(errorOf(res).message).toBe('This code has been fully used');
  });

  it('counts per-customer use by account, and a released redemption does not count', async () => {
    await createShippingMethods();
    const user = await createUser();
    const { token } = await createSession(user.id);
    const mine = await code({ code: 'ONEEACH', perCustomerMax: 1 });
    const earlier = await placedOrder(user.email, user.id);
    const [row] = await db
      .insert(discountRedemptions)
      .values({ codeId: mine.id, orderId: earlier.id, customerKey: user.id })
      .returning();

    const shop = makeShopper(app, token);
    await shop.addToCart(await variant(3000));
    let res = await shop.call('post', '/cart/code', { code: 'ONEEACH' });
    expect(errorOf(res).message).toBe("You've already used this code");

    // A guest has no history until checkout gives an email: the cart accepts the code.
    const guest = makeShopper(app);
    await guest.addToCart(await variant(3000));
    expect((await guest.call('post', '/cart/code', { code: 'ONEEACH' })).status).toBe(200);

    await db
      .update(discountRedemptions)
      .set({ releasedAt: new Date() })
      .where(eq(discountRedemptions.id, row!.id));
    res = await shop.call('post', '/cart/code', { code: 'ONEEACH' });
    expect(res.status).toBe(200);
  });

  it('refuses a first-order code for a customer with a paid order', async () => {
    await createShippingMethods();
    const user = await createUser();
    const { token } = await createSession(user.id);
    await code({ code: 'WELCOME5', kind: 'fixed', value: 500, firstOrderOnly: true });
    await placedOrder(user.email, user.id);
    const shop = makeShopper(app, token);
    await shop.addToCart(await variant(3000));
    const res = await shop.call('post', '/cart/code', { code: 'WELCOME5' });
    expect(errorOf(res).message).toBe('This code is for a first order only');
  });

  it('keeps a code the tier beats, with a notice saying so', async () => {
    await createShippingMethods();
    await db.insert(bulkTiers).values({ minCents: 5000, percent: 10 });
    await code({ code: 'SMALL', kind: 'fixed', value: 100 });
    const shop = makeShopper(app);
    await shop.addToCart(await variant(6000));
    const res = await shop.call('post', '/cart/code', { code: 'SMALL' });
    expect(res.status).toBe(200);
    const pricing = pricingOf(res);
    expect(pricing.code).toBe('SMALL');
    expect(pricing.discountCents).toBe(600);
    expect(pricing.notices.map((n) => n.key)).toContain('code_not_stackable');
  });

  it('rejects a malformed code before touching the cart', async () => {
    const shop = makeShopper(app);
    const res = await shop.call('post', '/cart/code', { code: 'no spaces!' });
    expect(res.status).toBe(400);
  });
});
