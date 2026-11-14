import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { products } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createReview } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';

import { approveReview, deleteReview, rejectReview } from './moderation.ts';

const app = makeTestApp();

async function aggregate(productId: string) {
  const [row] = await db
    .select({ count: products.ratingCount, sum: products.ratingSum })
    .from(products)
    .where(eq(products.id, productId));
  return row;
}

describe('rating aggregate kept in step with moderation', () => {
  it('approve increments, and approving twice does not count twice', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id, { status: 'pending', rating: 4 });
    expect(await aggregate(product.id)).toEqual({ count: 0, sum: 0 });
    await approveReview(r.id);
    await approveReview(r.id);
    expect(await aggregate(product.id)).toEqual({ count: 1, sum: 4 });
  });

  it('rejecting a previously approved review decrements; rejecting a pending one changes nothing', async () => {
    const { product } = await createProduct();
    const a = await createReview(product.id, { status: 'pending', rating: 5 });
    const b = await createReview(product.id, { status: 'pending', rating: 2 });
    await approveReview(a.id);
    await approveReview(b.id);
    expect(await aggregate(product.id)).toEqual({ count: 2, sum: 7 });
    await rejectReview(a.id, 'Contains a phone number');
    expect(await aggregate(product.id)).toEqual({ count: 1, sum: 2 });

    const c = await createReview(product.id, { status: 'pending', rating: 1 });
    await rejectReview(c.id, 'Spam');
    expect(await aggregate(product.id)).toEqual({ count: 1, sum: 2 });
  });

  it('can approve a rejected review again, and stores the reason then clears it', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id, { status: 'pending', rating: 3 });
    const rejected = await rejectReview(r.id, 'Off topic');
    expect(rejected.review.rejectReason).toBe('Off topic');
    const approved = await approveReview(r.id);
    expect(approved.review).toMatchObject({ status: 'approved', rejectReason: null });
    expect(await aggregate(product.id)).toEqual({ count: 1, sum: 3 });
  });

  it('deleting an approved review decrements, a pending one does not', async () => {
    const { product } = await createProduct();
    const a = await createReview(product.id, { rating: 5 });
    await db
      .update(products)
      .set({ ratingCount: 1, ratingSum: 5 })
      .where(eq(products.id, product.id));
    const p = await createReview(product.id, { status: 'pending', rating: 1 });
    await deleteReview(p.id);
    expect(await aggregate(product.id)).toEqual({ count: 1, sum: 5 });
    await deleteReview(a.id);
    expect(await aggregate(product.id)).toEqual({ count: 0, sum: 0 });
  });

  it('never goes below zero even if the aggregate had drifted', async () => {
    const { product } = await createProduct();
    // Approved review whose rating was never added (a drift we want to survive).
    const r = await createReview(product.id, { rating: 5 });
    await rejectReview(r.id, 'Spam');
    expect(await aggregate(product.id)).toEqual({ count: 0, sum: 0 });
  });

  it('answers a missing review with 404', async () => {
    await expect(approveReview('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('shows the rating on list cards and the product page', async () => {
    const { product } = await createProduct();
    const a = await createReview(product.id, { status: 'pending', rating: 5 });
    const b = await createReview(product.id, { status: 'pending', rating: 4 });
    await approveReview(a.id);
    await approveReview(b.id);
    const detail = await request(app).get(`/api/v1/products/${product.slug}`);
    expect(bodyOf<{ data: { rating: unknown } }>(detail).data.rating).toEqual({
      count: 2,
      averageTenths: 45,
    });
    const list = await request(app).get('/api/v1/products');
    const card = bodyOf<{ data: { slug: string; rating: unknown }[] }>(list).data.find(
      (c) => c.slug === product.slug,
    );
    expect(card?.rating).toEqual({ count: 2, averageTenths: 45 });
  });

  it('gives an unreviewed product count 0 and average 0', async () => {
    const { product } = await createProduct();
    const detail = await request(app).get(`/api/v1/products/${product.slug}`);
    expect(bodyOf<{ data: { rating: unknown } }>(detail).data.rating).toEqual({
      count: 0,
      averageTenths: 0,
    });
  });
});
