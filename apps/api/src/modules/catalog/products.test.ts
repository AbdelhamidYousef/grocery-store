import type { ProductCard } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';

const app = makeTestApp();

interface ListBody {
  data: ProductCard[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

async function list(query = '') {
  const res = await request(app).get(`/api/v1/products${query}`);
  return { res, body: bodyOf<ListBody>(res) };
}

const names = (body: ListBody) => body.data.map((p) => p.name);

describe('GET /api/v1/products — base list', () => {
  it('returns an empty page with zero totals when the catalog is empty', async () => {
    const { res, body } = await list();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: [], meta: { page: 1, limit: 24, total: 0, totalPages: 0 } });
  });

  it('returns card fields: price range, stock flag, primary image, attribute subset', async () => {
    await createProduct({
      name: 'Rope',
      attributes: { pet: 'dog', material: 'cotton', optionKeys: ['size'], size: 'L' },
      variants: [
        { options: { size: 'S' }, priceCents: 500 },
        { options: { size: 'L' }, priceCents: 900, stock: 0 },
      ],
      images: [{ url: '/a.webp', alt: 'A' }, { url: '/b.webp' }],
    });

    const { body } = await list();

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      name: 'Rope',
      price: { minCents: 500, maxCents: 900, currency: 'EUR' },
      inStock: true,
      image: { url: '/a.webp', alt: 'A', width: 1200, height: 1200 },
      attributes: { pet: 'dog', material: 'cotton' },
    });
    // Internal keys such as optionKeys never leave on a card.
    expect(body.data[0]?.attributes).not.toHaveProperty('optionKeys');
  });

  it('reports inStock false when every variant is sold out or fully reserved', async () => {
    await createProduct({
      variants: [{ stock: 0 }, { options: { v: '2' }, stock: 3, reserved: 3 }],
    });
    const { body } = await list();
    expect(body.data[0]?.inStock).toBe(false);
  });

  it('returns a null image for a product without images', async () => {
    await createProduct();
    const { body } = await list();
    expect(body.data[0]?.image).toBeNull();
  });

  it('prefers a product-level image over a variant-specific one', async () => {
    await createProduct({
      variants: [{}, { options: { v: '2' } }],
      images: [
        { url: '/variant.webp', variantIndex: 1, sortOrder: 0 },
        { url: '/product.webp', sortOrder: 5 },
      ],
    });
    const { body } = await list();
    expect(body.data[0]?.image?.url).toBe('/product.webp');
  });

  it('lists only active products with at least one active variant', async () => {
    await createProduct({ name: 'Visible' });
    await createProduct({ name: 'Draft', status: 'draft' });
    await createProduct({ name: 'Archived', status: 'archived' });
    await createProduct({ name: 'No active variant', variants: [{ status: 'archived' }] });
    const { body } = await list();
    expect(names(body)).toEqual(['Visible']);
  });

  it('ignores archived variants when computing the price range', async () => {
    await createProduct({
      variants: [{ priceCents: 700 }, { options: { v: '2' }, priceCents: 100, status: 'archived' }],
    });
    const { body } = await list();
    expect(body.data[0]?.price).toMatchObject({ minCents: 700, maxCents: 700 });
  });
});

describe('GET /api/v1/products — sorting', () => {
  async function seed() {
    await createProduct({
      name: 'banana',
      variants: [{ priceCents: 300 }],
      createdAt: new Date('2026-01-02'),
    });
    await createProduct({
      name: 'Apple',
      variants: [{ priceCents: 900 }],
      createdAt: new Date('2026-01-03'),
    });
    await createProduct({
      name: 'cherry',
      variants: [{ priceCents: 100 }],
      createdAt: new Date('2026-01-01'),
    });
  }

  it.each([
    ['newest', ['Apple', 'banana', 'cherry']],
    ['price_asc', ['cherry', 'banana', 'Apple']],
    ['price_desc', ['Apple', 'banana', 'cherry']],
    ['name', ['Apple', 'banana', 'cherry']],
  ])('sorts by %s', async (sort, expected) => {
    await seed();
    const { body } = await list(`?sort=${sort}`);
    expect(names(body)).toEqual(expected);
  });

  it('defaults to newest first', async () => {
    await seed();
    const { body } = await list();
    expect(names(body)).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('treats relevance without a search term as the default order', async () => {
    await seed();
    const { res, body } = await list('?sort=relevance');
    expect(res.status).toBe(200);
    expect(names(body)).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('breaks price ties by id so pages never repeat or skip a product', async () => {
    for (let i = 0; i < 5; i++)
      await createProduct({ name: `P${i}`, variants: [{ priceCents: 500 }] });
    const first = await list('?sort=price_asc&limit=2&page=1');
    const second = await list('?sort=price_asc&limit=2&page=2');
    const third = await list('?sort=price_asc&limit=2&page=3');
    const all = [...first.body.data, ...second.body.data, ...third.body.data].map((p) => p.id);
    expect(new Set(all).size).toBe(5);
  });
});

describe('GET /api/v1/products — pagination', () => {
  it('pages through results and reports totals', async () => {
    for (let i = 1; i <= 5; i++) {
      await createProduct({ name: `P${i}`, createdAt: new Date(2026, 0, i) });
    }
    const p1 = await list('?limit=2&page=1');
    const p3 = await list('?limit=2&page=3');
    expect(names(p1.body)).toEqual(['P5', 'P4']);
    expect(p1.body.meta).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
    expect(names(p3.body)).toEqual(['P1']);
  });

  it('returns an empty page (not an error) beyond the last page', async () => {
    await createProduct();
    const { res, body } = await list('?page=9');
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta).toMatchObject({ page: 9, total: 1, totalPages: 1 });
  });

  it.each([['page=0'], ['page=abc'], ['limit=0'], ['limit=101'], ['sort=cheapest']])(
    'rejects %s with 400 VALIDATION_ERROR',
    async (query) => {
      const { res } = await list(`?${query}`);
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    },
  );
});
