import type { ProductListResponse } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createBrand, createProduct, createTag, tagProduct } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';

const app = makeTestApp();

async function list(query = '') {
  return bodyOf<ProductListResponse>(await request(app).get(`/api/v1/products${query}`));
}

describe('quick filter chips and the price range on GET /products', () => {
  it('sends the chips ordered: On sale, New, brands, then health needs', async () => {
    const big = await createBrand({ name: 'Bigco' });
    const small = await createBrand({ name: 'Smallco' });
    const dental = await createTag({ name: 'Dental care' });
    const onSale = await createProduct({
      brandId: big.id,
      variants: [{ priceCents: 800, compareAtPriceCents: 1000 }],
    });
    await createProduct({ brandId: big.id, createdAt: new Date() });
    await createProduct({ brandId: small.id });
    await tagProduct(onSale.product.id, dental.id);

    const { chips } = await list();
    expect(chips.map((c) => `${c.kind}:${c.label}`)).toEqual([
      'badge:On sale',
      'badge:New',
      'brand:Bigco',
      'brand:Smallco',
      'tag:Dental care',
    ]);
    expect(chips.find((c) => c.label === 'Bigco')?.count).toBe(2);
  });

  it('counts chips over the scope, not the clicked filter, so a chip stays when switched on', async () => {
    const brand = await createBrand({ name: 'Keepco' });
    await createProduct({ brandId: brand.id });
    await createProduct({});
    const filtered = await list(`?brand=${brand.slug}`);
    expect(filtered.data).toHaveLength(1);
    expect(filtered.chips.find((c) => c.label === 'Keepco')?.count).toBe(1);
  });

  it('keeps the price range in cents over the scope, ignoring the price filter itself', async () => {
    await createProduct({ variants: [{ priceCents: 799 }] });
    await createProduct({ variants: [{ priceCents: 1899 }, { priceCents: 2500 }] });
    const all = await list();
    expect(all.facets.price).toEqual({ min: 799, max: 2500 });
    const narrowed = await list('?minPrice=1500&maxPrice=1900');
    expect(narrowed.data).toHaveLength(1);
    expect(narrowed.facets.price).toEqual({ min: 799, max: 2500 });
  });

  it('has no chips for an empty catalogue', async () => {
    expect((await list()).chips).toEqual([]);
  });
});
