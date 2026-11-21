import type { CategoryNode, ProductCard, ProductDetail } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  brandTranslations,
  categoryTranslations,
  productTranslations,
} from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createBrand, createCategory, createProduct } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';

const app = makeTestApp();
const get = (path: string, store?: string) => {
  const req = request(app).get(path);
  return store ? req.set('X-Store-View', store) : req;
};

async function seed() {
  const category = await createCategory({ slug: 'dog-toys', name: 'Dog toys' });
  const brand = await createBrand({ slug: 'waggle', name: 'Waggle', tagline: 'Wag more' });
  const { product } = await createProduct({
    slug: 'squeaky-bone',
    name: 'Squeaky bone',
    description: 'A bone that squeaks.',
    categoryId: category.id,
    brandId: brand.id,
  });
  return { category, brand, product };
}

describe('catalogue translations', () => {
  it('answers in English without the header, and for unknown store codes', async () => {
    const { product } = await seed();
    await db.insert(productTranslations).values({
      productId: product.id,
      locale: 'de',
      name: 'Quietschknochen',
      slug: 'quietschknochen',
    });
    for (const store of [undefined, 'de-en', 'nope']) {
      const res = await get('/api/v1/products/squeaky-bone', store);
      expect(bodyOf<{ data: ProductDetail }>(res).data.name).toBe('Squeaky bone');
    }
  });

  it('falls back to English field by field', async () => {
    const { product, category, brand } = await seed();
    await db
      .insert(productTranslations)
      .values({ productId: product.id, locale: 'de', name: 'Quietschknochen' });
    await db
      .insert(categoryTranslations)
      .values({ categoryId: category.id, locale: 'de', name: 'Hundespielzeug' });
    await db.insert(brandTranslations).values({ brandId: brand.id, locale: 'de', tagline: '   ' });

    const res = await get('/api/v1/products/squeaky-bone', 'de-de');
    const { data } = bodyOf<{ data: ProductDetail }>(res);
    expect(data.name).toBe('Quietschknochen');
    // No translated description or slug: English stays.
    expect(data.description).toBe('A bone that squeaks.');
    expect(data.slug).toBe('squeaky-bone');
    expect(data.category.name).toBe('Hundespielzeug');
    expect(data.brand?.name).toBe('Waggle');
    // The English view never reads the translation tables.
    const en = bodyOf<{ data: ProductDetail }>(await get('/api/v1/products/squeaky-bone', 'de-en'));
    expect(en.data.name).toBe('Squeaky bone');
  });

  it('resolves slugs per locale and reports the right slug for a redirect', async () => {
    const { product } = await seed();
    await db
      .insert(productTranslations)
      .values([
        { productId: product.id, locale: 'de', name: 'Quietschknochen', slug: 'quietschknochen' },
      ]);
    const de = await get('/api/v1/products/quietschknochen', 'de-de');
    expect(de.status).toBe(200);
    expect(bodyOf<{ data: ProductDetail }>(de).data.slug).toBe('quietschknochen');
    // The English slug still works in German (and reports the German one).
    const en = await get('/api/v1/products/squeaky-bone', 'de-de');
    expect(bodyOf<{ data: ProductDetail }>(en).data.slug).toBe('quietschknochen');
    // A German slug opened in the English store answers with the English slug.
    const wrong = await get('/api/v1/products/quietschknochen', 'de-en');
    expect(bodyOf<{ data: ProductDetail }>(wrong).data.slug).toBe('squeaky-bone');
    expect((await get('/api/v1/products/unknown', 'de-de')).status).toBe(404);
  });

  it('serves reviews, recommendations and substitutes under the translated product slug', async () => {
    const { product } = await seed();
    await db.insert(productTranslations).values({
      productId: product.id,
      locale: 'de',
      name: 'Quietschknochen',
      slug: 'quietschknochen',
    });
    // The German product page asks for these with the slug in its URL; they used to answer 404.
    for (const path of ['reviews', 'recommendations', 'substitutes']) {
      const res = await get(`/api/v1/products/quietschknochen/${path}`, 'de-de');
      expect(res.status, path).toBe(200);
    }
  });

  it('translates list cards, the category tree and filters by a translated slug', async () => {
    const { product, category } = await seed();
    await db.insert(productTranslations).values({
      productId: product.id,
      locale: 'de',
      name: 'Quietschknochen',
      slug: 'quietschknochen',
    });
    await db.insert(categoryTranslations).values({
      categoryId: category.id,
      locale: 'de',
      name: 'Hundespielzeug',
      slug: 'hundespielzeug',
    });

    const list = bodyOf<{ data: ProductCard[] }>(
      await get('/api/v1/products?category=hundespielzeug', 'de-de'),
    );
    expect(list.data.map((c) => c.name)).toEqual(['Quietschknochen']);
    const tree = bodyOf<{ data: CategoryNode[] }>(await get('/api/v1/categories', 'de-de'));
    expect(tree.data[0]?.name).toBe('Hundespielzeug');
    expect(tree.data[0]?.slug).toBe('hundespielzeug');
    const one = await get('/api/v1/categories/hundespielzeug', 'de-de');
    expect(bodyOf<{ data: CategoryNode }>(one).data.name).toBe('Hundespielzeug');
  });

  it('search matches the active language and English', async () => {
    const { product } = await seed();
    await db
      .insert(productTranslations)
      .values({ productId: product.id, locale: 'de', name: 'Quietschknochen' });
    const names = async (q: string, store?: string) =>
      bodyOf<{ data: ProductCard[] }>(await get(`/api/v1/products?q=${q}`, store)).data.map(
        (c) => c.name,
      );
    expect(await names('Quietsch', 'de-de')).toEqual(['Quietschknochen']);
    expect(await names('squeaky', 'de-de')).toEqual(['Quietschknochen']);
    expect(await names('Quietsch')).toEqual([]);
    const suggest = await get('/api/v1/search/suggest?q=Quietsch', 'de-de');
    expect(JSON.stringify(bodyOf(suggest))).toContain('Quietschknochen');
  });

  it('sets Vary: X-Store-View', async () => {
    const res = await get('/api/v1/categories', 'de-de');
    expect(res.headers['vary']).toMatch(/X-Store-View/i);
  });
});
