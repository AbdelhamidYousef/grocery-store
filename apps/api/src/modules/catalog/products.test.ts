import type { ProductCard } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createCategory, createProduct } from '../../test/factories.ts';
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
    expect(body).toMatchObject({
      data: [],
      meta: { page: 1, limit: 24, total: 0, totalPages: 0 },
    });
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

describe('GET /api/v1/products — filters', () => {
  it('filters by category and includes child categories', async () => {
    const dogs = await createCategory({ slug: 'dogs', name: 'Dogs' });
    const toys = await createCategory({ slug: 'dog-toys', name: 'Toys', parentId: dogs.id });
    const cats = await createCategory({ slug: 'cats', name: 'Cats' });
    await createProduct({ name: 'Direct', categoryId: dogs.id });
    await createProduct({ name: 'Child', categoryId: toys.id });
    await createProduct({ name: 'Other', categoryId: cats.id });

    expect(names((await list('?category=dogs')).body).sort()).toEqual(['Child', 'Direct']);
    expect(names((await list('?category=dog-toys')).body)).toEqual(['Child']);
    expect(names((await list('?category=cats')).body)).toEqual(['Other']);
  });

  it('returns an empty list for an unknown category', async () => {
    await createProduct();
    const { res, body } = await list('?category=nope');
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('filters by price on variant prices (a product matches if any variant is in range)', async () => {
    await createProduct({
      name: 'Mixed',
      variants: [{ priceCents: 500 }, { options: { v: '2' }, priceCents: 2500 }],
    });
    await createProduct({ name: 'Cheap', variants: [{ priceCents: 200 }] });
    await createProduct({ name: 'Dear', variants: [{ priceCents: 5000 }] });

    expect(names((await list('?minPrice=2000&maxPrice=3000')).body)).toEqual(['Mixed']);
    expect(names((await list('?maxPrice=300')).body)).toEqual(['Cheap']);
    expect(names((await list('?minPrice=4000')).body)).toEqual(['Dear']);
    expect(names((await list('?minPrice=500&maxPrice=500')).body)).toEqual(['Mixed']);
  });

  it('rejects minPrice above maxPrice with 400', async () => {
    const { res } = await list('?minPrice=900&maxPrice=100');
    expect(res.status).toBe(400);
  });

  it('filters by inStock, counting reserved units as unavailable', async () => {
    await createProduct({ name: 'Plenty', variants: [{ stock: 10 }] });
    await createProduct({ name: 'Gone', variants: [{ stock: 0 }] });
    await createProduct({ name: 'Held', variants: [{ stock: 2, reserved: 2 }] });
    await createProduct({
      name: 'OneSizeLeft',
      variants: [{ stock: 0 }, { options: { v: '2' }, stock: 1 }],
    });

    expect(names((await list('?inStock=true')).body).sort()).toEqual(['OneSizeLeft', 'Plenty']);
    expect((await list('?inStock=false')).body.meta.total).toBe(4);
  });

  it('filters by attribute: OR within a key, AND across keys', async () => {
    await createProduct({ name: 'Plush dog', attributes: { pet: 'dog', material: 'plush' } });
    await createProduct({ name: 'Rubber dog', attributes: { pet: 'dog', material: 'rubber' } });
    await createProduct({ name: 'Plush cat', attributes: { pet: 'cat', material: 'plush' } });
    await createProduct({ name: 'Wood cat', attributes: { pet: 'cat', material: 'wood' } });

    expect(names((await list('?attr.material=plush,rubber')).body).sort()).toEqual([
      'Plush cat',
      'Plush dog',
      'Rubber dog',
    ]);
    expect(names((await list('?attr.pet=dog&attr.material=plush,rubber')).body).sort()).toEqual([
      'Plush dog',
      'Rubber dog',
    ]);
    expect(names((await list('?attr.pet=cat&attr.material=rubber')).body)).toEqual([]);
  });

  it('treats attribute values as data, not SQL', async () => {
    await createProduct({ attributes: { material: 'plush' } });
    const { res, body } = await list(`?attr.material=${encodeURIComponent(`x'} OR 1=1 --`)}`);
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('combines category, price, stock, attribute, sort and pagination', async () => {
    const dogs = await createCategory({ slug: 'dogs', name: 'Dogs' });
    for (const [name, price, stock] of [
      ['A', 900, 5],
      ['B', 400, 5],
      ['C', 600, 0],
      ['D', 700, 5],
    ] as const) {
      await createProduct({
        name,
        categoryId: dogs.id,
        attributes: { pet: 'dog' },
        variants: [{ priceCents: price, stock }],
      });
    }
    await createProduct({ name: 'Cat thing', attributes: { pet: 'cat' } });

    const { body } = await list(
      '?category=dogs&attr.pet=dog&inStock=true&minPrice=500&sort=price_asc&limit=1&page=2',
    );
    expect(names(body)).toEqual(['A']);
    expect(body.meta).toMatchObject({ total: 2, totalPages: 2, page: 2 });
  });

  it('keeps meta.total consistent with the filters', async () => {
    await createProduct({ attributes: { pet: 'dog' } });
    await createProduct({ attributes: { pet: 'dog' } });
    await createProduct({ attributes: { pet: 'cat' } });
    expect((await list('?attr.pet=dog')).body.meta.total).toBe(2);
  });
});

describe('GET /api/v1/products — full-text search', () => {
  async function seedToys() {
    await createProduct({
      name: 'Braided Tug Rope',
      description: 'A thick cotton rope for tug games.',
      createdAt: new Date('2026-01-01'),
    });
    await createProduct({
      name: 'Rope Ball',
      description: 'A ball made of knotted rope. Rope everywhere, rope rope rope.',
      createdAt: new Date('2026-01-02'),
    });
    await createProduct({
      name: 'Squeaky Fox',
      description: 'A plush fox that squeaks.',
      createdAt: new Date('2026-01-03'),
    });
    await createProduct({
      name: 'Seed Mix',
      description: 'A tasty mix for your pet parrot or budgie.',
      createdAt: new Date('2026-01-04'),
    });
  }

  it('finds products by words in the name or description', async () => {
    await seedToys();
    expect(names((await list('?q=rope')).body).sort()).toEqual(['Braided Tug Rope', 'Rope Ball']);
    expect(names((await list('?q=parrot')).body)).toEqual(['Seed Mix']);
  });

  it('matches word forms through stemming (ropes finds rope, squeaking finds squeaks)', async () => {
    await seedToys();
    expect((await list('?q=ropes')).body.meta.total).toBe(2);
    expect(names((await list('?q=squeaking')).body)).toEqual(['Squeaky Fox']);
  });

  it('ranks by relevance by default when searching, newest breaking ties', async () => {
    await seedToys();
    // "Rope Ball" mentions rope many more times, so it outranks the older, newer-listed ordering.
    expect(names((await list('?q=rope')).body)).toEqual(['Rope Ball', 'Braided Tug Rope']);
  });

  it('lets another sort override relevance', async () => {
    await seedToys();
    expect(names((await list('?q=rope&sort=name')).body)).toEqual([
      'Braided Tug Rope',
      'Rope Ball',
    ]);
  });

  it('supports websearch syntax: quoted phrases, exclusion and or', async () => {
    await seedToys();
    expect(names((await list(`?q=${encodeURIComponent('"tug games"')}`)).body)).toEqual([
      'Braided Tug Rope',
    ]);
    expect(names((await list(`?q=${encodeURIComponent('rope -ball')}`)).body)).toEqual([
      'Braided Tug Rope',
    ]);
    expect(names((await list(`?q=${encodeURIComponent('parrot or fox')}`)).body).sort()).toEqual([
      'Seed Mix',
      'Squeaky Fox',
    ]);
  });

  it('does not promise typo tolerance: a misspelling finds nothing', async () => {
    await seedToys();
    expect((await list('?q=rpoe')).body.data).toEqual([]);
  });

  it('falls back to a name substring match for 1-2 character input', async () => {
    await seedToys();
    expect(names((await list('?q=fo')).body)).toEqual(['Squeaky Fox']);
    expect(names((await list('?q=ro')).body).sort()).toEqual(['Braided Tug Rope', 'Rope Ball']);
  });

  it('treats LIKE wildcards in short input literally', async () => {
    await seedToys();
    expect((await list(`?q=${encodeURIComponent('%')}`)).body.data).toEqual([]);
  });

  it('falls back to a name search when the query is only stop words', async () => {
    await createProduct({ name: 'The Thing', description: 'zzz' });
    expect(names((await list('?q=the')).body)).toEqual(['The Thing']);
  });

  it('returns an empty list for punctuation-only input without erroring', async () => {
    await seedToys();
    const { res, body } = await list(`?q=${encodeURIComponent('!!!')}`);
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('combines search with filters and counts the matches', async () => {
    await createProduct({ name: 'Dog rope', description: 'rope', attributes: { pet: 'dog' } });
    await createProduct({ name: 'Cat rope', description: 'rope', attributes: { pet: 'cat' } });
    const { body } = await list('?q=rope&attr.pet=dog');
    expect(names(body)).toEqual(['Dog rope']);
    expect(body.meta.total).toBe(1);
  });

  it('rejects an empty or over-long q with 400', async () => {
    expect((await list('?q=')).res.status).toBe(400);
    expect((await list(`?q=${'x'.repeat(101)}`)).res.status).toBe(400);
  });
});

describe('GET /api/v1/products — facets', () => {
  type FacetBody = ListBody & {
    facets: {
      attributes: Record<string, { value: string; count: number }[]>;
      price: { min: number; max: number } | null;
    };
  };
  const facets = async (query = '') => bodyOf<FacetBody>((await list(query)).res).facets;

  async function seed() {
    const dogs = await createCategory({ slug: 'dogs', name: 'Dogs' });
    const cats = await createCategory({ slug: 'cats', name: 'Cats' });
    await createProduct({
      name: 'Plush dog toy',
      description: 'squeaky',
      categoryId: dogs.id,
      attributes: { pet: 'dog', material: 'plush', brand: 'Pawsome' },
      variants: [{ priceCents: 500 }, { options: { v: '2' }, priceCents: 900 }],
    });
    await createProduct({
      name: 'Rubber dog toy',
      description: 'squeaky',
      categoryId: dogs.id,
      attributes: { pet: 'dog', material: 'rubber', brand: 'Pawsome' },
      variants: [{ priceCents: 1500 }],
    });
    await createProduct({
      name: 'Plush cat toy',
      description: 'catnip',
      categoryId: cats.id,
      attributes: { pet: 'cat', material: 'plush', brand: 'Pawsome' },
      variants: [{ priceCents: 300 }],
    });
    await createProduct({ name: 'Draft toy', status: 'draft', attributes: { pet: 'dog' } });
  }

  it('returns every facet key, empty when there is no data, and a null price range', async () => {
    const f = await facets();
    expect(f.attributes).toEqual({ pet: [], material: [], brand: [], ageStage: [] });
    expect(f.price).toBeNull();
  });

  it('counts attribute values over active products, most frequent first', async () => {
    await seed();
    const f = await facets();
    expect(f.attributes.pet).toEqual([
      { value: 'dog', count: 2 },
      { value: 'cat', count: 1 },
    ]);
    expect(f.attributes.material).toEqual([
      { value: 'plush', count: 2 },
      { value: 'rubber', count: 1 },
    ]);
    expect(f.attributes.brand).toEqual([{ value: 'Pawsome', count: 3 }]);
    expect(f.attributes.ageStage).toEqual([]);
  });

  it('reports the price range of the scope across all active variants', async () => {
    await seed();
    expect((await facets()).price).toEqual({ min: 300, max: 1500 });
  });

  it('scopes counts and price to the current category (children included)', async () => {
    await seed();
    const f = await facets('?category=dogs');
    expect(f.attributes.pet).toEqual([{ value: 'dog', count: 2 }]);
    expect(f.price).toEqual({ min: 500, max: 1500 });
  });

  it('scopes to the search term', async () => {
    await seed();
    const f = await facets('?q=catnip');
    expect(f.attributes.pet).toEqual([{ value: 'cat', count: 1 }]);
  });

  it('ignores attribute, price and stock filters so alternatives keep their counts', async () => {
    await seed();
    const unfiltered = await facets('?category=dogs');
    const filtered = await facets('?category=dogs&attr.material=plush&minPrice=400&maxPrice=600');
    expect(filtered).toEqual(unfiltered);
    // ...while the list itself is filtered.
    expect((await list('?category=dogs&attr.material=plush')).body.meta.total).toBe(1);
  });

  it('does not count non-facet attributes such as size', async () => {
    await createProduct({ attributes: { pet: 'dog', size: 'L' } });
    expect(Object.keys((await facets()).attributes).sort()).toEqual([
      'ageStage',
      'brand',
      'material',
      'pet',
    ]);
  });

  it('returns facets for the whole scope even on a page beyond the results', async () => {
    await seed();
    const f = await facets('?page=9');
    expect(f.attributes.pet).toHaveLength(2);
  });
});
