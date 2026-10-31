import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../../db/client.ts';
import {
  contactMessages,
  guideProducts,
  guides,
  helpArticles,
  orders,
  withdrawalRequests,
} from '../../../db/schema/index.ts';
import { makeTestApp } from '../../../test/app.ts';
import { createProduct, createShippingMethods } from '../../../test/factories.ts';
import { bodyOf, errorOf } from '../../../test/http.ts';
import { placeOrder, signedIn, simulate } from '../../../test/orders.ts';
import type { Shopper } from '../../../test/shopper.ts';
import { searchHelp } from '../../help/service.ts';

const app = makeTestApp();
let admin: Shopper;

beforeEach(async () => {
  admin = (await signedIn(app, 'admin', 'boss@pawsome.test')).shopper;
  await createShippingMethods();
});

const data = <T>(res: { body: unknown }) => bodyOf<{ data: T }>(res as never).data;

describe('access', () => {
  it.each([
    ['get', '/admin/guides'],
    ['get', '/admin/help-articles'],
    ['get', '/admin/testimonials'],
    ['get', '/admin/safety-notices'],
    ['get', '/admin/withdrawals'],
    ['get', '/admin/contact-messages'],
    ['get', '/admin/home-content'],
  ] as const)('%s %s is closed to guests and customers', async (method, path) => {
    const guest = (await signedIn(app, 'customer')).shopper;
    expect((await guest.call(method, path)).status).toBe(403);
    const anon = (await import('../../../test/shopper.ts')).makeShopper(app);
    expect((await anon.call(method, path)).status).toBe(401);
  });
});

const guideBody = (over: Record<string, unknown> = {}) => ({
  title: 'Choosing a leash',
  summary: 'Short.',
  bodyMd: 'Some **text**.',
  category: 'Dogs',
  status: 'published',
  productIds: [],
  ...over,
});

describe('guides', () => {
  it('creates a guide with a slug from the title, a category and linked products', async () => {
    const { product } = await createProduct({ name: 'Leash' });
    const res = await admin.call('post', '/admin/guides', guideBody({ productIds: [product.id] }));
    expect(res.status).toBe(201);
    const g = data<{ id: string; slug: string; products: { id: string }[]; publishedAt: string }>(
      res,
    );
    expect(g.slug).toBe('choosing-a-leash');
    expect(g.products.map((p) => p.id)).toEqual([product.id]);
    // Publishing without a date means now.
    expect(Math.abs(Date.now() - new Date(g.publishedAt).getTime())).toBeLessThan(60_000);
    // And the public API now serves it.
    const { default: request } = await import('supertest');
    expect((await request(app).get('/api/v1/guides/choosing-a-leash')).status).toBe(200);
  });

  it('replaces the linked products on update and keeps the original publish date', async () => {
    const a = (await createProduct()).product;
    const b = (await createProduct()).product;
    const created = data<{ id: string; publishedAt: string }>(
      await admin.call('post', '/admin/guides', guideBody({ productIds: [a.id] })),
    );
    const res = await admin.call(
      'put',
      `/admin/guides/${created.id}`,
      guideBody({ productIds: [b.id], title: 'New title' }),
    );
    const g = data<{ products: { id: string }[]; publishedAt: string; slug: string }>(res);
    expect(g.products.map((p) => p.id)).toEqual([b.id]);
    expect(g.publishedAt).toBe(created.publishedAt);
    expect(await db.select().from(guideProducts)).toHaveLength(1);
  });

  it('unpublishing hides it from the public API', async () => {
    const created = data<{ id: string }>(await admin.call('post', '/admin/guides', guideBody()));
    await admin.call('put', `/admin/guides/${created.id}`, guideBody({ status: 'draft' }));
    const { default: request } = await import('supertest');
    expect((await request(app).get('/api/v1/guides/choosing-a-leash')).status).toBe(404);
  });

  it('rejects a duplicate slug with 409 and an unknown product with 400', async () => {
    await admin.call('post', '/admin/guides', guideBody());
    const dup = await admin.call('post', '/admin/guides', guideBody());
    expect(dup.status).toBe(409);
    const bad = await admin.call(
      'post',
      '/admin/guides',
      guideBody({ title: 'Other', productIds: ['00000000-0000-4000-8000-000000000000'] }),
    );
    expect(bad.status).toBe(400);
    expect(await db.select().from(guides)).toHaveLength(1);
  });

  it('validates the input and 404s on an unknown id', async () => {
    expect((await admin.call('post', '/admin/guides', guideBody({ title: '' }))).status).toBe(400);
    expect(
      (await admin.call('post', '/admin/guides', guideBody({ coverUrl: 'javascript:alert(1)' })))
        .status,
    ).toBe(400);
    expect(
      (await admin.call('get', '/admin/guides/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404);
  });

  it('deletes a guide', async () => {
    const created = data<{ id: string }>(await admin.call('post', '/admin/guides', guideBody()));
    expect((await admin.call('delete', `/admin/guides/${created.id}`)).status).toBe(204);
    expect(await db.select().from(guides)).toHaveLength(0);
  });
});

describe('help articles', () => {
  const help = (over: Record<string, unknown> = {}) => ({
    topic: 'shipping',
    question: 'How fast is delivery?',
    answerMd: 'Three days.',
    ...over,
  });

  it('creates, edits and deletes, and search follows the edit', async () => {
    const created = data<{ id: string; slug: string }>(
      await admin.call('post', '/admin/help-articles', help()),
    );
    expect(created.slug).toBe('how-fast-is-delivery');
    expect((await searchHelp('delivery')).map((h) => h.slug)).toEqual([created.slug]);

    await admin.call(
      'put',
      `/admin/help-articles/${created.id}`,
      help({ question: 'Do you ship abroad?', answerMd: 'Yes.' }),
    );
    // The generated tsvector column is rebuilt by the database on update.
    expect(await searchHelp('delivery')).toEqual([]);
    expect((await searchHelp('abroad')).length).toBe(1);

    expect((await admin.call('delete', `/admin/help-articles/${created.id}`)).status).toBe(204);
    expect(await db.select().from(helpArticles)).toHaveLength(0);
  });

  it('rejects an unknown topic and a duplicate slug', async () => {
    expect(
      (await admin.call('post', '/admin/help-articles', help({ topic: 'weather' }))).status,
    ).toBe(400);
    await admin.call('post', '/admin/help-articles', help());
    expect((await admin.call('post', '/admin/help-articles', help())).status).toBe(409);
  });
});

describe('testimonials', () => {
  it('creates, updates and deletes one, with the rating kept between 1 and 5', async () => {
    const body = { name: 'Mara', pet: 'Biscuit', rating: 5, quote: 'Great!', isFeatured: true };
    const created = data<{ id: string }>(await admin.call('post', '/admin/testimonials', body));
    const updated = await admin.call('put', `/admin/testimonials/${created.id}`, {
      ...body,
      rating: 4,
    });
    expect(data<{ rating: number }>(updated).rating).toBe(4);
    expect((await admin.call('post', '/admin/testimonials', { ...body, rating: 6 })).status).toBe(
      400,
    );
    expect((await admin.call('post', '/admin/testimonials', { ...body, rating: 0 })).status).toBe(
      400,
    );
    expect((await admin.call('delete', `/admin/testimonials/${created.id}`)).status).toBe(204);
    expect(data<unknown[]>(await admin.call('get', '/admin/testimonials'))).toHaveLength(0);
  });
});

describe('withdrawal queue', () => {
  it('lists requests and moves them new -> acknowledged -> done', async () => {
    const { number } = await placeOrder(app, { email: 'ada@pawsome.test' });
    await simulate(app, number);
    const [order] = await db.select().from(orders).where(eq(orders.number, number));
    const [row] = await db
      .insert(withdrawalRequests)
      .values({ orderId: order!.id, email: 'ada@pawsome.test', reason: 'x' })
      .returning();

    const list = data<{ id: string; status: string; orderNumber: string; reference: string }[]>(
      await admin.call('get', '/admin/withdrawals'),
    );
    expect(list[0]).toMatchObject({ id: row!.id, status: 'new', orderNumber: number });
    expect(list[0]?.reference).toMatch(/^WD-/);

    const ack = data<{ status: string; acknowledgedAt: string | null }>(
      await admin.call('patch', `/admin/withdrawals/${row!.id}`, { status: 'acknowledged' }),
    );
    expect(ack.status).toBe('acknowledged');
    expect(ack.acknowledgedAt).not.toBeNull();
    const done = data<{ status: string; acknowledgedAt: string }>(
      await admin.call('patch', `/admin/withdrawals/${row!.id}`, { status: 'done' }),
    );
    expect(done).toMatchObject({ status: 'done', acknowledgedAt: ack.acknowledgedAt });
    expect(
      (await admin.call('patch', `/admin/withdrawals/${row!.id}`, { status: 'weird' })).status,
    ).toBe(400);
  });
});

describe('contact messages', () => {
  it('marks a message handled and can reopen it', async () => {
    const [m] = await db
      .insert(contactMessages)
      .values({ name: 'Ada', email: 'ada@pawsome.test', topic: 'order', message: 'Where is it?' })
      .returning();
    const handled = data<{ handledAt: string | null }>(
      await admin.call('patch', `/admin/contact-messages/${m!.id}`, { handled: true }),
    );
    expect(handled.handledAt).not.toBeNull();
    const reopened = data<{ handledAt: string | null }>(
      await admin.call('patch', `/admin/contact-messages/${m!.id}`, { handled: false }),
    );
    expect(reopened.handledAt).toBeNull();
    expect(
      (await admin.call('patch', '/admin/contact-messages/not-a-uuid', { handled: true })).status,
    ).toBe(400);
  });

  it('lists open messages before handled ones', async () => {
    const make = (name: string, handledAt: Date | null) =>
      db
        .insert(contactMessages)
        .values({ name, email: 'a@b.test', topic: 'other', message: 'hello there', handledAt });
    await make('Done', new Date());
    await make('Open', null);
    const list = data<{ name: string }[]>(await admin.call('get', '/admin/contact-messages'));
    expect(list.map((m) => m.name)).toEqual(['Open', 'Done']);
  });
});

describe('home content', () => {
  it('serves defaults, then the edited hero slides and promo tile', async () => {
    const first = data<{ heroSlides: unknown[]; promoTile: { enabled: boolean } }>(
      await admin.call('get', '/admin/home-content'),
    );
    expect(first.heroSlides).toHaveLength(3);
    expect(first.promoTile.enabled).toBe(false);

    const slide = { title: 'Hello', text: 'World', ctaLabel: 'Go', ctaHref: '/c/dogs' };
    const put = await admin.call('put', '/admin/home-content/hero_slides', { value: [slide] });
    expect(put.status).toBe(200);
    expect(data<{ heroSlides: unknown[] }>(put).heroSlides).toHaveLength(1);

    const promo = await admin.call('put', '/admin/home-content/promo_tile', {
      value: { enabled: true, text: 'Free shipping', linkLabel: 'Shop', linkHref: '/c/cats' },
    });
    expect(data<{ promoTile: { text: string } }>(promo).promoTile.text).toBe('Free shipping');
  });

  it('refuses a bad value, an unsafe link and an unknown key', async () => {
    const slide = { title: 'Hello', text: 'World', ctaLabel: 'Go', ctaHref: 'javascript:alert(1)' };
    expect(
      (await admin.call('put', '/admin/home-content/hero_slides', { value: [slide] })).status,
    ).toBe(400);
    expect((await admin.call('put', '/admin/home-content/hero_slides', { value: [] })).status).toBe(
      400,
    );
    expect((await admin.call('put', '/admin/home-content/other', { value: 1 })).status).toBe(400);
    const err = errorOf(
      await admin.call('put', '/admin/home-content/promo_tile', { value: 'nope' }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});

describe('safety notices', () => {
  it('creates a notice for variants, lists its delivery count and deletes it', async () => {
    const { variants } = await createProduct();
    const body = {
      title: 'Recall',
      bodyMd: 'Stop using it.',
      severity: 'recall',
      status: 'published',
      variantIds: [variants[0]!.id],
    };
    const created = data<{
      id: string;
      isActive: boolean;
      variants: { sku: string }[];
      deliveryCount: number;
    }>(await admin.call('post', '/admin/safety-notices', body));
    expect(created).toMatchObject({ isActive: true, deliveryCount: 0 });
    expect(created.variants).toHaveLength(1);

    const upd = data<{ isActive: boolean }>(
      await admin.call('put', `/admin/safety-notices/${created.id}`, { ...body, status: 'draft' }),
    );
    expect(upd.isActive).toBe(false);

    expect((await admin.call('delete', `/admin/safety-notices/${created.id}`)).status).toBe(204);
    expect(data<unknown[]>(await admin.call('get', '/admin/safety-notices'))).toHaveLength(0);
  });

  it('refuses an end before the start and an unknown variant', async () => {
    const base = { title: 'x', bodyMd: 'y', severity: 'info', status: 'published' };
    const bad = await admin.call('post', '/admin/safety-notices', {
      ...base,
      startsAt: '2026-10-02T00:00:00.000Z',
      endsAt: '2026-10-01T00:00:00.000Z',
    });
    expect(bad.status).toBe(400);
    const ghost = await admin.call('post', '/admin/safety-notices', {
      ...base,
      variantIds: ['00000000-0000-4000-8000-000000000000'],
    });
    expect(ghost.status).toBe(400);
  });
});
