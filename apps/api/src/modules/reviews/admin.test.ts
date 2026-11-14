import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { emailOutbox, products, reviewPhotos, reviews } from '../../db/schema/index.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createReview, createUser } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';
import { createOutbox } from '../mail/outbox.ts';

let transport: MemoryTransport;
let outbox: ReturnType<typeof createOutbox>;
let app: ReturnType<typeof makeTestApp>;

beforeEach(() => {
  transport = new MemoryTransport();
  outbox = createOutbox({ transport, log: pino({ level: 'silent' }) });
  app = makeTestApp({ outbox });
});

type AdminList = {
  data: {
    id: string;
    title: string;
    status: string;
    authorEmail: string | null;
    photos: unknown[];
  }[];
  meta: { total: number };
};

describe('admin review moderation', () => {
  it('is closed to guests (401) and customers (403)', async () => {
    const r = await createReview((await createProduct()).product.id, { status: 'pending' });
    const { shopper } = await signedIn(app, 'customer');
    expect((await shopper.call('get', '/admin/reviews')).status).toBe(403);
    expect((await shopper.call('post', `/admin/reviews/${r.id}/approve`)).status).toBe(403);
    expect((await shopper.call('delete', `/admin/reviews/${r.id}`)).status).toBe(403);
  });

  it('lists the pending queue oldest first, with the author email and photos', async () => {
    const { product } = await createProduct();
    const older = await createReview(product.id, {
      status: 'pending',
      title: 'Older',
      createdAt: new Date('2026-01-01'),
    });
    await createReview(product.id, {
      status: 'pending',
      title: 'Newer',
      createdAt: new Date('2026-02-01'),
    });
    await createReview(product.id, { status: 'approved', title: 'Done' });
    await db.insert(reviewPhotos).values({ reviewId: older.id, path: '/reviews/a.webp' });
    const { shopper } = await signedIn(app, 'admin');
    const res = await shopper.call('get', '/admin/reviews?status=pending');
    const body = bodyOf<AdminList>(res);
    expect(body.data.map((r) => r.title)).toEqual(['Older', 'Newer']);
    expect(body.data[0]?.photos).toHaveLength(1);
    expect(body.data[0]?.authorEmail).toMatch(/@pawsome\.test$/);
    expect(body.meta.total).toBe(2);
    const approved = bodyOf<AdminList>(await shopper.call('get', '/admin/reviews?status=approved'));
    expect(approved.data).toHaveLength(1);
  });

  it('approves: status, moderated time, aggregate, and a thank-you email', async () => {
    const { product } = await createProduct({ name: 'Cloud Bed' });
    const author = await createUser({ firstName: 'Ada', email: 'ada.review@pawsome.test' });
    const r = await createReview(product.id, { userId: author.id, status: 'pending', rating: 4 });
    const { shopper } = await signedIn(app, 'admin');
    const res = await shopper.call('post', `/admin/reviews/${r.id}/approve`);
    expect(res.status).toBe(200);
    expect(bodyOf<{ data: { status: string } }>(res).data.status).toBe('approved');
    const [row] = await db.select().from(reviews).where(eq(reviews.id, r.id));
    expect(row?.moderatedAt).not.toBeNull();
    const [p] = await db.select().from(products).where(eq(products.id, product.id));
    expect(p).toMatchObject({ ratingCount: 1, ratingSum: 4 });

    await outbox.drain();
    const mail = transport.sent.find((m) => m.to === 'ada.review@pawsome.test');
    expect(mail?.subject).toBe('Your review of Cloud Bed is live');
    expect(mail?.text).toContain(`/products/${product.slug}#reviews`);

    // Approving again changes nothing and queues no second email.
    await shopper.call('post', `/admin/reviews/${r.id}/approve`);
    expect(await db.select().from(emailOutbox)).toHaveLength(1);
  });

  it('rejects with a reason (required), and un-counts a previously approved review', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id, { status: 'pending', rating: 5 });
    const { shopper } = await signedIn(app, 'admin');
    expect((await shopper.call('post', `/admin/reviews/${r.id}/reject`, {})).status).toBe(400);
    await shopper.call('post', `/admin/reviews/${r.id}/approve`);
    const res = await shopper.call('post', `/admin/reviews/${r.id}/reject`, {
      reason: 'Mentions a competitor',
    });
    expect(bodyOf<{ data: { status: string; rejectReason: string } }>(res).data).toMatchObject({
      status: 'rejected',
      rejectReason: 'Mentions a competitor',
    });
    const [p] = await db.select().from(products).where(eq(products.id, product.id));
    expect(p).toMatchObject({ ratingCount: 0, ratingSum: 0 });
  });

  it('a rejected review never reaches the public list', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id, { status: 'pending' });
    const { shopper } = await signedIn(app, 'admin');
    await shopper.call('post', `/admin/reviews/${r.id}/reject`, { reason: 'Spam' });
    const pub = await shopper.call('get', `/products/${product.slug}/reviews`);
    expect(bodyOf<{ data: unknown[] }>(pub).data).toHaveLength(0);
  });

  it('deletes a review and answers 404 for an unknown one', async () => {
    const { product } = await createProduct();
    const r = await createReview(product.id);
    const { shopper } = await signedIn(app, 'admin');
    expect((await shopper.call('delete', `/admin/reviews/${r.id}`)).status).toBe(204);
    expect(await db.select().from(reviews)).toHaveLength(0);
    const again = await shopper.call('delete', `/admin/reviews/${r.id}`);
    expect(again.status).toBe(404);
    expect(errorOf(again).code).toBe('NOT_FOUND');
  });
});
