import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { guideCategories, guideProducts, guides } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';

const app = makeTestApp();

let n = 0;
async function makeGuide(
  over: Partial<typeof guides.$inferInsert> & { categoryId: string },
): Promise<typeof guides.$inferSelect> {
  n += 1;
  const [row] = await db
    .insert(guides)
    .values({
      slug: `guide-${n}`,
      title: `Guide ${n}`,
      summary: 'Summary.',
      bodyMd: 'word '.repeat(450),
      status: 'published',
      publishedAt: new Date(Date.UTC(2026, 0, n)),
      ...over,
    })
    .returning();
  return row!;
}
async function makeCategory(slug: string, name = slug) {
  const [row] = await db.insert(guideCategories).values({ slug, name }).returning();
  return row!;
}

interface Card {
  slug: string;
  readingMinutes: number;
}
const list = async (qs = '') =>
  bodyOf<{ data: Card[]; meta: { total: number } }>(await request(app).get(`/api/v1/guides${qs}`));

let dogs: { id: string };
let cats: { id: string };
beforeEach(async () => {
  dogs = await makeCategory('dogs', 'Dogs');
  cats = await makeCategory('cats', 'Cats');
});

describe('GET /guides', () => {
  it('lists published guides newest first with a reading time', async () => {
    await makeGuide({ categoryId: dogs.id, slug: 'old' });
    await makeGuide({ categoryId: dogs.id, slug: 'new' });
    const body = await list();
    expect(body.data.map((g) => g.slug)).toEqual(['new', 'old']);
    // 450 words at 200 wpm rounds up to 3 minutes.
    expect(body.data[0]?.readingMinutes).toBe(3);
  });

  it('hides drafts and guides scheduled for the future', async () => {
    await makeGuide({ categoryId: dogs.id, slug: 'live' });
    await makeGuide({ categoryId: dogs.id, slug: 'draft', status: 'draft' });
    await makeGuide({ categoryId: dogs.id, slug: 'later', publishedAt: new Date('2099-01-01') });
    expect((await list()).data.map((g) => g.slug)).toEqual(['live']);
  });

  it('filters by category and paginates', async () => {
    await makeGuide({ categoryId: dogs.id });
    await makeGuide({ categoryId: cats.id, slug: 'cat-one' });
    await makeGuide({ categoryId: cats.id, slug: 'cat-two' });
    const page = await list('?category=cats&limit=1&page=2');
    expect(page.meta.total).toBe(2);
    expect(page.data.map((g) => g.slug)).toEqual(['cat-one']);
  });
});

describe('GET /guide-categories', () => {
  it('counts only visible guides and drops empty categories', async () => {
    await makeGuide({ categoryId: dogs.id });
    await makeGuide({ categoryId: cats.id, status: 'draft' });
    const res = await request(app).get('/api/v1/guide-categories');
    expect(bodyOf<{ data: unknown[] }>(res).data).toEqual([
      { slug: 'dogs', name: 'Dogs', guideCount: 1 },
    ]);
  });
});

describe('GET /guides/:slug', () => {
  it('returns 404 for an unknown slug', async () => {
    expect((await request(app).get('/api/v1/guides/nope')).status).toBe(404);
  });

  it('returns 404 for an unpublished guide', async () => {
    await makeGuide({ categoryId: dogs.id, slug: 'secret', status: 'draft' });
    expect((await request(app).get('/api/v1/guides/secret')).status).toBe(404);
  });

  it('returns the body and the linked products as product cards', async () => {
    const guide = await makeGuide({ categoryId: dogs.id, slug: 'with-products' });
    const { product } = await createProduct({ name: 'Rope' });
    const { product: hidden } = await createProduct({ name: 'Archived', status: 'archived' });
    await db.insert(guideProducts).values([
      { guideId: guide.id, productId: product.id },
      { guideId: guide.id, productId: hidden.id },
    ]);
    const res = await request(app).get('/api/v1/guides/with-products');
    const data = bodyOf<{ data: { bodyMd: string; products: { slug: string }[] } }>(res).data;
    expect(data.bodyMd).toContain('word');
    // The archived product is not buyable, so it is not recommended.
    expect(data.products.map((p) => p.slug)).toEqual([product.slug]);
  });

  it('gives three related guides, same category first, never itself', async () => {
    const me = await makeGuide({ categoryId: dogs.id, slug: 'me' });
    await makeGuide({ categoryId: dogs.id, slug: 'dog-a' });
    await makeGuide({ categoryId: cats.id, slug: 'cat-newest' });
    await makeGuide({ categoryId: dogs.id, slug: 'dog-b' });
    await makeGuide({
      categoryId: cats.id,
      slug: 'cat-older',
      publishedAt: new Date('2025-01-01'),
    });
    const res = await request(app).get('/api/v1/guides/me');
    const related = bodyOf<{ data: { related: Card[] } }>(res).data.related.map((g) => g.slug);
    expect(related).toEqual(['dog-b', 'dog-a', 'cat-newest']);
    expect(related).not.toContain(me.slug);
  });

  it('sends the public cache header', async () => {
    await makeGuide({ categoryId: dogs.id, slug: 'cached' });
    const res = await request(app).get('/api/v1/guides/cached');
    expect(res.headers['cache-control']).toContain('public');
  });
});
