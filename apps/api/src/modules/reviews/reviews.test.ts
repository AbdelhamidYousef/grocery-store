import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { reviews } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { placeOrder, signedIn, simulate } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';

const app = makeTestApp();

beforeEach(async () => {
  await createShippingMethods();
});

const review = {
  rating: 5,
  title: 'Brilliant bed',
  body: 'My dog sleeps in it every single night and it still looks new.',
  wouldRecommend: true,
};

type Created = { data: { id: string; status: string; verifiedBuyer: boolean } };

describe('submitting a review', () => {
  it('answers 401 to a guest', async () => {
    const { product } = await createProduct();
    const res = await makeShopper(app).call('post', `/products/${product.slug}/reviews`, review);
    expect(res.status).toBe(401);
  });

  it('stores a pending, unverified review for someone who never bought the product', async () => {
    const { product } = await createProduct();
    const { shopper } = await signedIn(app);
    const res = await shopper.call('post', `/products/${product.slug}/reviews`, {
      ...review,
      petAgeMonths: 18,
      petWeightG: 4500,
    });
    expect(res.status).toBe(201);
    expect(bodyOf<Created>(res).data).toMatchObject({ status: 'pending', verifiedBuyer: false });
    const [row] = await db.select().from(reviews);
    expect(row).toMatchObject({ status: 'pending', petAgeMonths: 18, petWeightG: 4500 });
  });

  it('ignores a verifiedBuyer flag sent by the client', async () => {
    const { product } = await createProduct();
    const { shopper } = await signedIn(app);
    const res = await shopper.call('post', `/products/${product.slug}/reviews`, {
      ...review,
      verifiedBuyer: true,
    });
    expect(bodyOf<Created>(res).data.verifiedBuyer).toBe(false);
  });

  it('marks the review verified once a paid order contains the product', async () => {
    const { product, variants } = await createProduct();
    const { shopper } = await signedIn(app);
    const { number } = await placeOrder(app, { variantId: variants[0]!.id, shopper });
    await simulate(app, number);
    const res = await shopper.call('post', `/products/${product.slug}/reviews`, review);
    expect(res.status).toBe(201);
    expect(bodyOf<Created>(res).data.verifiedBuyer).toBe(true);
    const [row] = await db.select().from(reviews);
    expect(row?.orderId).not.toBeNull();
  });

  it('does not verify on an order that is still waiting for payment', async () => {
    const { product, variants } = await createProduct();
    const { shopper } = await signedIn(app);
    await placeOrder(app, { variantId: variants[0]!.id, shopper });
    const res = await shopper.call('post', `/products/${product.slug}/reviews`, review);
    expect(bodyOf<Created>(res).data.verifiedBuyer).toBe(false);
  });

  it("does not verify on somebody else's order", async () => {
    const { product, variants } = await createProduct();
    const { number } = await placeOrder(app, { variantId: variants[0]!.id });
    await simulate(app, number);
    const { shopper } = await signedIn(app);
    const res = await shopper.call('post', `/products/${product.slug}/reviews`, review);
    expect(bodyOf<Created>(res).data.verifiedBuyer).toBe(false);
  });

  it('answers 409 to a second review of the same product, and allows another product', async () => {
    const a = await createProduct();
    const b = await createProduct();
    const { shopper } = await signedIn(app);
    expect((await shopper.call('post', `/products/${a.product.slug}/reviews`, review)).status).toBe(
      201,
    );
    const dup = await shopper.call('post', `/products/${a.product.slug}/reviews`, review);
    expect(dup.status).toBe(409);
    expect(errorOf(dup).code).toBe('CONFLICT');
    expect((await shopper.call('post', `/products/${b.product.slug}/reviews`, review)).status).toBe(
      201,
    );
  });

  it('answers 404 for an unknown or draft product and 400 for an invalid review', async () => {
    const draft = await createProduct({ status: 'draft' });
    const live = await createProduct();
    const { shopper } = await signedIn(app);
    expect((await shopper.call('post', '/products/nope/reviews', review)).status).toBe(404);
    expect(
      (await shopper.call('post', `/products/${draft.product.slug}/reviews`, review)).status,
    ).toBe(404);
    const bad = await shopper.call('post', `/products/${live.product.slug}/reviews`, {
      ...review,
      rating: 9,
    });
    expect(bad.status).toBe(400);
    expect(await db.select().from(reviews).where(eq(reviews.status, 'pending'))).toHaveLength(0);
  });

  it('stores text raw (no HTML stripping or escaping) for React to render as text', async () => {
    const { product } = await createProduct();
    const { shopper } = await signedIn(app);
    const body = 'Loved it <b>so</b> much & my cat too, truly a great buy!';
    await shopper.call('post', `/products/${product.slug}/reviews`, { ...review, body });
    const [row] = await db.select().from(reviews);
    expect(row?.body).toBe(body);
  });

  it('answers 429 after the per-user limit and counts per account, not per IP', async () => {
    const limited = makeTestApp({
      config: { reviewRateLimit: { windowMs: 60_000, limit: 2 } },
    });
    const { shopper } = await signedIn(limited);
    const other = await signedIn(limited);
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { product } = await createProduct();
      statuses.push(
        (await shopper.call('post', `/products/${product.slug}/reviews`, review)).status,
      );
    }
    expect(statuses).toEqual([201, 201, 429]);
    const { product } = await createProduct();
    expect(
      (await other.shopper.call('post', `/products/${product.slug}/reviews`, review)).status,
    ).toBe(201);
  });
});
