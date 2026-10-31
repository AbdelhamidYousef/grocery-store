import { describe, expect, it } from 'vitest';

import { categories } from './categories.ts';
import { expandVariants, imageRows, stockLevels } from './expand.ts';
import { products } from './products.ts';

const variants = products.flatMap((p) => expandVariants(p).map((v) => ({ product: p, ...v })));

describe('seed catalog data', () => {
  it('has about 40 products across the five pets', () => {
    expect(products).toHaveLength(40);
    const perPet: Record<string, number> = {};
    for (const p of products) perPet[p.pet] = (perPet[p.pet] ?? 0) + 1;
    expect(perPet).toEqual({ dog: 10, cat: 10, bird: 7, fish: 7, small: 6 });
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

  it('has roughly 200 variants', () => {
    expect(variants.length).toBeGreaterThan(180);
    expect(variants.length).toBeLessThan(240);
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
});
