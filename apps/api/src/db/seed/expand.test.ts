import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { categories } from './categories.ts';
import { expandVariants, imageRows, stockLevels } from './expand.ts';
import { buildImagesBrief, imageRowsFor } from './images.ts';
import { products } from './products.ts';

const variants = products.flatMap((p) => expandVariants(p).map((v) => ({ product: p, ...v })));

describe('seed catalog data', () => {
  it('has 125 products across the six pets', () => {
    expect(products).toHaveLength(125);
    const perPet: Record<string, number> = {};
    for (const p of products) perPet[p.pet] = (perPet[p.pet] ?? 0) + 1;
    expect(perPet).toEqual({ dog: 25, cat: 25, bird: 20, fish: 10, small: 20, reptile: 25 });
  });

  it('has at least 5 products in every leaf category', () => {
    const perLeaf = new Map<string, number>();
    for (const c of categories) for (const child of c.children) perLeaf.set(child.slug, 0);
    for (const p of products) perLeaf.set(p.categorySlug, (perLeaf.get(p.categorySlug) ?? 0) + 1);
    for (const [leaf, n] of perLeaf) expect(n, leaf).toBeGreaterThanOrEqual(5);
  });

  it('keeps product codes unique per pet, so SKUs cannot collide', () => {
    const codes = products.map((p) => `${p.pet}-${p.code}`);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has trial sizes on at least ten food and treat products', () => {
    const withTrial = products.filter((p) => expandVariants(p).some((v) => v.isTrial));
    expect(withTrial.length).toBeGreaterThanOrEqual(10);
    for (const p of withTrial) expect(p.categorySlug, p.slug).toMatch(/treats|food/);
  });

  it('has unique slugs and SKUs', () => {
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
    expect(new Set(variants.map((v) => v.sku)).size).toBe(variants.length);
  });

  it('puts every product in an existing sub-category', () => {
    const leaves = new Set(categories.flatMap((c) => c.children.map((child) => child.slug)));
    for (const p of products) expect(leaves.has(p.categorySlug), p.slug).toBe(true);
  });

  it('gives each product exactly one default variant and integer prices', () => {
    for (const p of products) {
      const vs = expandVariants(p);
      expect(
        vs.filter((v) => v.isDefault),
        p.slug,
      ).toHaveLength(1);
      for (const v of vs) {
        expect(Number.isInteger(v.priceCents)).toBe(true);
        expect(Number.isInteger(v.weightGrams)).toBe(true);
        if (v.compareAtPriceCents !== null)
          expect(v.compareAtPriceCents).toBeGreaterThan(v.priceCents);
      }
    }
  });

  it('has roughly 500 variants', () => {
    expect(variants.length).toBeGreaterThan(400);
    expect(variants.length).toBeLessThan(650);
  });

  it('gives every product 1 or 2 images with alt text at 1200 x 1200', () => {
    for (const p of products) {
      const images = imageRows(p);
      expect(images.length).toBeGreaterThanOrEqual(1);
      expect(images.length).toBeLessThanOrEqual(2);
      for (const img of images) {
        expect(img.alt.length).toBeGreaterThan(10);
        expect(img.url).toBe(`/products/${p.categorySlug}/${p.slug}-${img.n}.webp`);
        expect([img.width, img.height]).toEqual([1200, 1200]);
      }
    }
  });

  it('produces the same stock on every run, with some sold out and some low', () => {
    const stock = stockLevels(variants.length);
    expect(stockLevels(variants.length)).toEqual(stock);
    expect(stock.every((q) => q >= 0 && q <= 120)).toBe(true);
    expect(stock.some((q) => q === 0)).toBe(true);
    expect(stock.some((q) => q > 0 && q < 5)).toBe(true);
  });

  it('gives every seeded image row alt text and a file on disk (real or placeholder)', () => {
    const publicDir = fileURLToPath(new URL('../../../../web/public', import.meta.url));
    for (const p of products) {
      const rows = imageRowsFor(p);
      expect(rows.length, p.slug).toBeGreaterThanOrEqual(1);
      for (const img of rows) {
        expect(img.alt.length, p.slug).toBeGreaterThan(10);
        expect(existsSync(publicDir + img.url), `${p.slug} ${img.url}`).toBe(true);
      }
    }
  });

  it('falls back to the pet placeholder when a product has no processed image', () => {
    const [rows] = [imageRowsFor(products[0] as (typeof products)[number], () => false)];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toBe('/products/placeholders/dog.svg');
  });

  it('keeps docs/images-brief.csv in step with the seed (run pnpm images:brief)', () => {
    const file = fileURLToPath(new URL('../../../../../docs/images-brief.csv', import.meta.url));
    expect(readFileSync(file, 'utf8')).toBe(buildImagesBrief(products));
  });
});
