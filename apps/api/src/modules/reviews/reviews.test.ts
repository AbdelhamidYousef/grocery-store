import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { orders, reviewPhotos, reviewVotes, reviews } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import {
  createProduct,
  createReview,
  createShippingMethods,
  createUser,
} from '../../test/factories.ts';
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
    const res = await shopper.call('post', `/products/${product.slug}/reviews`, review);
    expect(res.status).toBe(201);
    expect(bodyOf<Created>(res).data).toMatchObject({ status: 'pending', verifiedBuyer: false });
    const [row] = await db.select().from(reviews);
    expect(row).toMatchObject({ status: 'pending', sizePurchased: null });
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

  it('does not verify on a refunded order', async () => {
    const { product, variants } = await createProduct();
    const { shopper } = await signedIn(app);
    const { number } = await placeOrder(app, { variantId: variants[0]!.id, shopper });
    await simulate(app, number);
    await db.update(orders).set({ status: 'refunded' }).where(eq(orders.number, number));
    const res = await shopper.call('post', `/products/${product.slug}/reviews`, review);
    expect(res.status).toBe(201);
    expect(bodyOf<Created>(res).data.verifiedBuyer).toBe(false);
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

type ListBody = {
  data: {
    id: string;
    title: string;
    helpfulCount: number;
    votedHelpful: boolean;
    authorName: string;
    photos: { path: string }[];
  }[];
  meta: { total: number; totalPages: number };
  summary: {
    rating: { count: number; averageTenths: number };
    breakdown: number[];
    recommendPercent: number | null;
    topics: { topic: string; count: number }[];
  };
};

describe('listing reviews', () => {
  it('shows approved reviews only and 404s an unknown product', async () => {
    const { product } = await createProduct();
    await createReview(product.id, { title: 'Approved one' });
    await createReview(product.id, { title: 'Waiting', status: 'pending' });
    await createReview(product.id, { title: 'Turned down', status: 'rejected' });
    const res = await request(app).get(`/api/v1/products/${product.slug}/reviews`);
    expect(res.status).toBe(200);
    expect(bodyOf<ListBody>(res).data.map((r) => r.title)).toEqual(['Approved one']);
    expect(bodyOf<ListBody>(res).meta.total).toBe(1);
    expect((await request(app).get('/api/v1/products/nope/reviews')).status).toBe(404);
  });

  it('computes the breakdown, the average in tenths and the rounded recommend percent', async () => {
    const { product } = await createProduct();
    for (const [rating, rec] of [
      [5, true],
      [5, true],
      [4, true],
      [2, false],
    ] as const) {
      await createReview(product.id, { rating, wouldRecommend: rec });
    }
    // Pending reviews must not count.
    await createReview(product.id, { rating: 1, status: 'pending', wouldRecommend: false });
    const { summary } = bodyOf<ListBody>(
      await request(app).get(`/api/v1/products/${product.slug}/reviews`),
    );
    expect(summary.breakdown).toEqual([0, 1, 0, 1, 2]);
    // (5+5+4+2)/4 = 4.0
    expect(summary.rating).toEqual({ count: 4, averageTenths: 40 });
    expect(summary.recommendPercent).toBe(75);
  });

  it('rounds the average half up (4.5 -> 45) and an empty product has nulls', async () => {
    const a = await createProduct();
    await createReview(a.product.id, { rating: 5 });
    await createReview(a.product.id, { rating: 4 });
    const withTwo = bodyOf<ListBody>(
      await request(app).get(`/api/v1/products/${a.product.slug}/reviews`),
    );
    expect(withTwo.summary.rating.averageTenths).toBe(45);
    const empty = await createProduct();
    const none = bodyOf<ListBody>(
      await request(app).get(`/api/v1/products/${empty.product.slug}/reviews`),
    );
    expect(none.summary).toMatchObject({
      rating: { count: 0, averageTenths: 0 },
      breakdown: [0, 0, 0, 0, 0],
      recommendPercent: null,
      topics: [],
    });
  });

  it('sorts by helpful, newest and photos', async () => {
    const { product } = await createProduct();
    await createReview(product.id, {
      title: 'Old but loved',
      helpfulCount: 9,
      createdAt: new Date('2026-01-01'),
    });
    await createReview(product.id, { title: 'Newest', createdAt: new Date('2026-06-01') });
    const pic = await createReview(product.id, {
      title: 'With photo',
      createdAt: new Date('2026-03-01'),
    });
    await db.insert(reviewPhotos).values({ reviewId: pic.id, path: '/reviews/x.webp' });
    const titles = async (q: string) =>
      bodyOf<ListBody>(
        await request(app).get(`/api/v1/products/${product.slug}/reviews${q}`),
      ).data.map((r) => r.title);
    expect((await titles('?sort=helpful'))[0]).toBe('Old but loved');
    expect(await titles('?sort=newest')).toEqual(['Newest', 'With photo', 'Old but loved']);
    expect((await titles('?sort=photos'))[0]).toBe('With photo');
  });

  it('filters by star rating and by topic phrase, and paginates ten at a time', async () => {
    const { product } = await createProduct();
    for (let i = 0; i < 12; i++) {
      await createReview(product.id, {
        rating: i === 0 ? 3 : 5,
        body:
          i < 2
            ? 'The memory foam is wonderful for my old dog.'
            : 'Great quality all round, truly.',
      });
    }
    const get = async (q: string) =>
      bodyOf<ListBody>(await request(app).get(`/api/v1/products/${product.slug}/reviews${q}`));
    expect((await get('')).data).toHaveLength(10);
    expect((await get('?page=2')).data).toHaveLength(2);
    expect((await get('')).meta.totalPages).toBe(2);
    expect((await get('?rating=3')).meta.total).toBe(1);
    expect((await get('?topic=memory%20foam')).meta.total).toBe(2);
    // A wildcard typed as a topic is just text.
    expect((await get('?topic=%25')).meta.total).toBe(0);
    expect(
      (await request(app).get(`/api/v1/products/${product.slug}/reviews?rating=9`)).status,
    ).toBe(400);
  });

  it('returns topic chips from words in at least three approved reviews', async () => {
    const { product } = await createProduct();
    for (let i = 0; i < 3; i++) {
      await createReview(product.id, { body: 'The washable cover is superb, sturdy zipper too.' });
    }
    await createReview(product.id, {
      body: 'Hidden gem nobody mentions: quokka',
      status: 'pending',
    });
    const { summary } = bodyOf<ListBody>(
      await request(app).get(`/api/v1/products/${product.slug}/reviews`),
    );
    const names = summary.topics.map((t) => t.topic);
    expect(names).toContain('washable cover');
    expect(names).toContain('sturdy zipper');
    expect(names).not.toContain('quokka');
  });

  it("shows a first name and last initial, never the email, and 'A Grocery customer' with no account", async () => {
    const { product } = await createProduct();
    const user = await createUser({ firstName: 'Ada', lastName: 'Lovelace' });
    await createReview(product.id, { userId: user.id, title: 'By Ada' });
    await createReview(product.id, { title: 'Orphan' });
    await db.update(reviews).set({ userId: null }).where(eq(reviews.title, 'Orphan'));
    const res = await request(app).get(`/api/v1/products/${product.slug}/reviews?sort=newest`);
    const names = bodyOf<ListBody>(res)
      .data.map((r) => r.authorName)
      .sort();
    expect(names).toEqual(['A Grocery customer', 'Ada L.']);
    expect(JSON.stringify(res.body)).not.toContain('@');
  });
});

describe('helpful votes', () => {
  it('answers 401 to a guest and 404 to a pending review', async () => {
    const { product } = await createProduct();
    const approved = await createReview(product.id);
    const pending = await createReview(product.id, { status: 'pending' });
    expect((await makeShopper(app).call('post', `/reviews/${approved.id}/helpful`)).status).toBe(
      401,
    );
    const { shopper } = await signedIn(app);
    expect((await shopper.call('post', `/reviews/${pending.id}/helpful`)).status).toBe(404);
  });

  it('adds a vote, takes it back on the second call, and shows votedHelpful to that user only', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id);
    const { shopper } = await signedIn(app);
    const first = await shopper.call('post', `/reviews/${r.id}/helpful`);
    expect(bodyOf<{ data: { helpfulCount: number; voted: boolean } }>(first).data).toEqual({
      helpfulCount: 1,
      voted: true,
    });
    const mine = bodyOf<ListBody>(await shopper.call('get', `/products/${product.slug}/reviews`));
    expect(mine.data[0]).toMatchObject({ helpfulCount: 1, votedHelpful: true });
    const guest = bodyOf<ListBody>(
      await request(app).get(`/api/v1/products/${product.slug}/reviews`),
    );
    expect(guest.data[0]).toMatchObject({ helpfulCount: 1, votedHelpful: false });
    const second = await shopper.call('post', `/reviews/${r.id}/helpful`);
    expect(bodyOf<{ data: { helpfulCount: number; voted: boolean } }>(second).data).toEqual({
      helpfulCount: 0,
      voted: false,
    });
  });

  it('counts one vote per user across users', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id);
    const a = await signedIn(app);
    const b = await signedIn(app);
    await a.shopper.call('post', `/reviews/${r.id}/helpful`);
    const res = await b.shopper.call('post', `/reviews/${r.id}/helpful`);
    expect(bodyOf<{ data: { helpfulCount: number } }>(res).data.helpfulCount).toBe(2);
    expect(await db.select().from(reviewVotes)).toHaveLength(2);
  });

  it('forbids voting on your own review', async () => {
    const { product } = await createProduct();
    const { user, shopper } = await signedIn(app);
    const r = await createReview(product.id, { userId: user.id });
    const res = await shopper.call('post', `/reviews/${r.id}/helpful`);
    expect(res.status).toBe(403);
  });

  it('answers 429 after the vote limit', async () => {
    const limited = makeTestApp({ config: { voteRateLimit: { windowMs: 60_000, limit: 1 } } });
    const { product } = await createProduct();
    const a = await createReview(product.id);
    const b = await createReview(product.id);
    const { shopper } = await signedIn(limited);
    expect((await shopper.call('post', `/reviews/${a.id}/helpful`)).status).toBe(200);
    expect((await shopper.call('post', `/reviews/${b.id}/helpful`)).status).toBe(429);
  });
});
