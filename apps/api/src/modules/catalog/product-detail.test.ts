import type { ProductDetail } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createCategory, createProduct } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';

const app = makeTestApp();

async function detail(slug: string) {
  const res = await request(app).get(`/api/v1/products/${slug}`);
  return { res, data: bodyOf<{ data: ProductDetail }>(res).data };
}

describe('GET /api/v1/products/:slug', () => {
  it('returns the full product with variants, images, attributes, optionKeys and breadcrumb', async () => {
    const dogs = await createCategory({ slug: 'dogs', name: 'Dogs' });
    const toys = await createCategory({ slug: 'dog-toys', name: 'Toys', parentId: dogs.id });
    const { variants } = await createProduct({
      slug: 'rope',
      name: 'Rope',
      description: 'A rope.',
      categoryId: toys.id,
      attributes: {
        pet: 'dog',
        material: 'cotton',
        optionKeys: ['color', 'size'],
      },
      variants: [
        {
          name: 'Red · L',
          options: { color: 'red', size: 'L' },
          priceCents: 900,
          compareAtPriceCents: 1100,
        },
        { name: 'Red · S', options: { color: 'red', size: 'S' }, priceCents: 500 },
      ],
      images: [
        { url: '/second.webp', sortOrder: 2 },
        { url: '/first.webp', sortOrder: 1 },
        { url: '/red.webp', sortOrder: 3, variantIndex: 0 },
      ],
    });

    const { res, data } = await detail('rope');

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      slug: 'rope',
      name: 'Rope',
      description: 'A rope.',
      category: { slug: 'dog-toys', name: 'Toys' },
      breadcrumb: [
        { slug: 'dogs', name: 'Dogs' },
        { slug: 'dog-toys', name: 'Toys' },
      ],
      attributes: { pet: 'dog', material: 'cotton' },
      optionKeys: ['color', 'size'],
      price: { minCents: 500, maxCents: 900, currency: 'EUR' },
      inStock: true,
    });
    expect(data.attributes).not.toHaveProperty('optionKeys');
    expect(data.images.map((i) => i.url)).toEqual(['/first.webp', '/second.webp', '/red.webp']);
    expect(data.images[2]?.variantId).toBe(variants[0]?.id);
    // Cheapest variant first; compare-at price and default flag are carried.
    expect(data.variants.map((v) => v.name)).toEqual(['Red · S', 'Red · L']);
    expect(data.variants[1]).toMatchObject({ compareAtPriceCents: 1100, priceCents: 900 });
    expect(data.variants.filter((v) => v.isDefault)).toHaveLength(1);
  });

  it('has a one-item breadcrumb for a top-level category', async () => {
    const dogs = await createCategory({ slug: 'dogs', name: 'Dogs' });
    await createProduct({ slug: 'bone', categoryId: dogs.id });
    const { data } = await detail('bone');
    expect(data.breadcrumb).toEqual([{ slug: 'dogs', name: 'Dogs' }]);
  });

  it('exposes availability and low stock as booleans and never the raw count', async () => {
    await createProduct({
      slug: 'stocky',
      variants: [
        { options: { s: 'plenty' }, stock: 100, lowStockThreshold: 5 },
        { options: { s: 'low' }, stock: 4, lowStockThreshold: 5 },
        { options: { s: 'edge' }, stock: 5, lowStockThreshold: 5 },
        { options: { s: 'held' }, stock: 3, reserved: 3 },
        { options: { s: 'none' }, stock: 0 },
      ],
    });
    const { res, data } = await detail('stocky');
    const variant = (key: string) => data.variants.find((v) => v.options.s === key);

    expect(variant('plenty')).toMatchObject({ available: true, lowStock: false });
    expect(variant('low')).toMatchObject({ available: true, lowStock: true });
    expect(variant('edge')).toMatchObject({ available: true, lowStock: true });
    expect(variant('held')).toMatchObject({ available: false, lowStock: false });
    expect(variant('none')).toMatchObject({ available: false, lowStock: false });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/quantity|reserved|lowStockThreshold/);
  });

  it('reports inStock false when no variant is available', async () => {
    await createProduct({ slug: 'gone', variants: [{ stock: 0 }] });
    expect((await detail('gone')).data.inStock).toBe(false);
  });

  it('hides archived variants', async () => {
    await createProduct({
      slug: 'half',
      variants: [{ name: 'Live' }, { name: 'Old', options: { v: '2' }, status: 'archived' }],
    });
    expect((await detail('half')).data.variants.map((v) => v.name)).toEqual(['Live']);
  });

  it('returns empty images and optionKeys when there are none', async () => {
    await createProduct({ slug: 'bare' });
    const { data } = await detail('bare');
    expect(data.images).toEqual([]);
    expect(data.optionKeys).toEqual([]);
  });

  it.each([
    ['an unknown slug', 'nope'],
    ['a draft product', 'draft-one'],
    ['an archived product', 'archived-one'],
    ['a product with no active variants', 'no-variants'],
  ])('answers 404 NOT_FOUND for %s', async (_name, slug) => {
    await createProduct({ slug: 'draft-one', status: 'draft' });
    await createProduct({ slug: 'archived-one', status: 'archived' });
    await createProduct({ slug: 'no-variants', variants: [{ status: 'archived' }] });
    const res = await request(app).get(`/api/v1/products/${slug}`);
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });
});
