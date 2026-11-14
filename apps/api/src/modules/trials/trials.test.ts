import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { cartItems, carts, trialRedemptions } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createCart, createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { orderByNumber, placeOrder, signedIn, simulate } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';
import { mergeGuestCart } from '../cart/service.ts';
import { onOrderPaid } from '../orders/events.ts';

const app = makeTestApp();

beforeEach(async () => {
  await createShippingMethods();
});

async function trialProduct() {
  const { variants } = await createProduct({
    variants: [
      { options: { pack: '150g' }, priceCents: 600, netAmount: 150, netUnit: 'g' },
      { options: { pack: 'trial' }, priceCents: 99, netAmount: 50, netUnit: 'g', isTrial: true },
    ],
  });
  return { full: variants[0]!.id, trial: variants[1]!.id };
}

describe('trial size in the cart', () => {
  it('lets a trial in once, refuses a second add and a quantity of 2 with TRIAL_LIMIT', async () => {
    const { trial } = await trialProduct();
    const shopper = makeShopper(app);
    expect((await shopper.addToCart(trial)).status).toBe(200);

    const again = await shopper.addToCart(trial);
    expect(again.status).toBe(409);
    expect(errorOf(again).code).toBe('TRIAL_LIMIT');

    const cart = bodyOf<{ data: { items: { id: string; quantity: number }[] } }>(
      await shopper.call('get', '/cart'),
    ).data;
    expect(cart.items).toHaveLength(1);
    const set2 = await shopper.call('patch', `/cart/items/${cart.items[0]!.id}`, { quantity: 2 });
    expect(set2.status).toBe(409);
    expect(errorOf(set2).code).toBe('TRIAL_LIMIT');
    // Setting it to 1 (what it already is) is fine.
    expect(
      (await shopper.call('patch', `/cart/items/${cart.items[0]!.id}`, { quantity: 1 })).status,
    ).toBe(200);
  });

  it('does not limit the full-size variant of the same product', async () => {
    const { full } = await trialProduct();
    expect((await makeShopper(app).addToCart(full, 5)).status).toBe(200);
  });

  it('refuses a trial the signed-in customer already redeemed', async () => {
    const { trial } = await trialProduct();
    const { shopper } = await signedIn(app, 'customer');
    const { number } = await placeOrder(app, { variantId: trial, quantity: 1, shopper });
    await simulate(app, number);

    const res = await shopper.addToCart(trial);
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('TRIAL_LIMIT');
  });
});

describe('trial size at checkout and payment', () => {
  it('writes a redemption when the order is paid, and blocks a second order by the same guest email', async () => {
    const { trial } = await trialProduct();
    const first = await placeOrder(app, {
      variantId: trial,
      quantity: 1,
      email: 'Ada@Pawsome.test',
    });
    // Nothing is redeemed until the money arrives.
    expect(await db.select().from(trialRedemptions)).toHaveLength(0);
    await simulate(app, first.number);
    const rows = await db.select().from(trialRedemptions);
    expect(rows).toMatchObject([
      { customerKey: 'ada@pawsome.test', variantId: trial, releasedAt: null },
    ]);

    // A fresh guest cart, the same person (different capitalisation): the cart accepts it (it
    // cannot know the email), checkout refuses.
    const shopper = makeShopper(app);
    expect((await shopper.addToCart(trial)).status).toBe(200);
    const res = await shopper.call('post', '/checkout', {
      email: 'ada@PAWSOME.test',
      shippingAddress: {
        fullName: 'A',
        line1: '1 St',
        city: 'Riga',
        postalCode: 'LV-1',
        country: 'DE',
      },
      shippingMethodCode: 'standard',
    });
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('TRIAL_LIMIT');

    // A different person can still have one.
    const other = await placeOrder(app, {
      variantId: trial,
      quantity: 1,
      email: 'bo@pawsome.test',
    });
    expect(other.number).toBeTruthy();
  });

  it('uses the user id for a signed-in customer, whatever email the form holds', async () => {
    const { trial } = await trialProduct();
    const { user, shopper } = await signedIn(app, 'customer');
    const { number } = await placeOrder(app, { variantId: trial, quantity: 1, shopper });
    await simulate(app, number);
    const [row] = await db.select().from(trialRedemptions);
    expect(row?.customerKey).toBe(user.id);
  });

  it('releases the redemption when the paid order is cancelled', async () => {
    const { trial } = await trialProduct();
    const { number } = await placeOrder(app, {
      variantId: trial,
      quantity: 1,
      email: 'ada@pawsome.test',
    });
    await simulate(app, number);
    const admin = await signedIn(app, 'admin');
    const cancelled = await admin.shopper.call('post', `/admin/orders/${number}/transition`, {
      to: 'cancelled',
    });
    expect(cancelled.status).toBe(200);
    expect((await orderByNumber(number)).status).toBe('cancelled');

    const [row] = await db.select().from(trialRedemptions);
    expect(row?.releasedAt).not.toBeNull();
    // The slot is free again: the same guest may order it.
    const again = await placeOrder(app, {
      variantId: trial,
      quantity: 1,
      email: 'ada@pawsome.test',
    });
    expect(again.number).not.toBe(number);
  });

  it('keeps the database rule even if the service check is bypassed', async () => {
    const { trial } = await trialProduct();
    const { number } = await placeOrder(app, {
      variantId: trial,
      quantity: 1,
      email: 'ada@pawsome.test',
    });
    await simulate(app, number);
    const [row] = await db.select().from(trialRedemptions);
    await expect(
      db.insert(trialRedemptions).values({
        customerKey: 'ada@pawsome.test',
        variantId: trial,
        orderId: row!.orderId,
      }),
    ).rejects.toThrow();
    expect(
      await db.select().from(trialRedemptions).where(eq(trialRedemptions.variantId, trial)),
    ).toHaveLength(1);
  });
});

describe('guest cart merge', () => {
  it('merges a trial as one unit', async () => {
    const { trial } = await trialProduct();
    const { user } = await signedIn(app, 'customer');
    const { cart } = await createCart({ items: [{ variantId: trial, quantity: 3 }] });
    const result = await mergeGuestCart(cart.id, user.id);
    expect(result).toMatchObject({ merged: 1, dropped: 0 });
    const [mine] = await db.select().from(carts).where(eq(carts.userId, user.id));
    const [line] = await db
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, mine?.id ?? ''));
    expect(line?.quantity).toBe(1);
  });

  it('drops a trial the account already redeemed', async () => {
    const { trial } = await trialProduct();
    const { user, shopper } = await signedIn(app, 'customer');
    const { number } = await placeOrder(app, { variantId: trial, quantity: 1, shopper });
    await simulate(app, number);
    const { cart } = await createCart({ items: [{ variantId: trial, quantity: 1 }] });
    expect(await mergeGuestCart(cart.id, user.id)).toMatchObject({ merged: 0, dropped: 1 });
  });
});

describe('order events registry', () => {
  it('runs a registered handler inside the transition, once, even if added twice', async () => {
    const seen: string[] = [];
    const handler = (_tx: unknown, e: { orderId: string }) => {
      seen.push(e.orderId);
      return Promise.resolve();
    };
    onOrderPaid(handler);
    onOrderPaid(handler);
    const { number } = await placeOrder(app, { email: 'ada@pawsome.test' });
    await simulate(app, number);
    const order = await orderByNumber(number);
    expect(seen).toEqual([order.id]);
  });
});
