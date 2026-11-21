import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DEPARTMENTS } from '@store/shared';
import { describe, expect, it } from 'vitest';

import { brands } from './brands.ts';
import { categories } from './categories.ts';
import { FORCED_STOCK, expandVariants, imageRows, stockLevels } from './expand.ts';
import { imageRowsFor } from './images.ts';
import { products } from './products.ts';
import { tags } from './tags.ts';

const variants = products.flatMap((p) => expandVariants(p).map((v) => ({ product: p, ...v })));

describe('seed catalogue data', () => {
  it('has 120 products, 12 in each of the ten departments', () => {
    expect(products).toHaveLength(120);
    const perDepartment: Record<string, number> = {};
    for (const p of products) perDepartment[p.department] = (perDepartment[p.department] ?? 0) + 1;
    expect(Object.keys(perDepartment).sort()).toEqual(DEPARTMENTS.map((d) => d.slug).sort());
    for (const [department, n] of Object.entries(perDepartment)) expect(n, department).toBe(12);
  });

  it('has the ten shared departments, each with two to four subcategories', () => {
    expect(categories.map((c) => c.slug)).toEqual(DEPARTMENTS.map((d) => d.slug));
    for (const c of categories) {
      expect(c.children.length, c.slug).toBeGreaterThanOrEqual(2);
      expect(c.children.length, c.slug).toBeLessThanOrEqual(4);
    }
  });

  it('has eight brands, with the house brand among them', () => {
    expect(brands).toHaveLength(8);
    expect(brands.some((b) => b.slug === 'grocery-basics' && b.name === 'Grocery Basics')).toBe(
      true,
    );
  });

  it('has at least two products in every subcategory', () => {
    const perLeaf = new Map<string, number>();
    for (const c of categories) for (const child of c.children) perLeaf.set(child.slug, 0);
    for (const p of products) perLeaf.set(p.categorySlug, (perLeaf.get(p.categorySlug) ?? 0) + 1);
    for (const [leaf, n] of perLeaf) expect(n, leaf).toBeGreaterThanOrEqual(2);
  });

  it('uses only known tags', () => {
    const known = new Set(tags.map((t) => t.slug));
    for (const p of products) for (const t of p.tags ?? []) expect(known.has(t), p.slug).toBe(true);
    expect(products.some((p) => (p.tags ?? []).length > 0)).toBe(true);
  });

  it('has unique slugs and SKUs', () => {
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
    expect(new Set(variants.map((v) => v.sku)).size).toBe(variants.length);
  });

  it('has food information on food and none on the rest', () => {
    const food = products.filter((p) => p.nutrition !== null);
    const other = products.filter((p) => p.nutrition === null);
    expect(food.length).toBeGreaterThan(90);
    expect(other.length).toBeGreaterThan(15);
    for (const p of other) {
      expect([p.ingredients, p.allergens.length, p.dietary.length], p.slug).toEqual([null, 0, 0]);
    }
    for (const p of food) expect(p.ingredients, p.slug).toBeTruthy();
  });

  it('keeps the later-phase fields on every product', () => {
    for (const p of products) {
      expect(typeof p.soldByWeight, p.slug).toBe('boolean');
      expect(typeof p.deposit, p.slug).toBe('boolean');
      expect(Number.isInteger(p.shelfLifeDays), p.slug).toBe(true);
    }
    expect(products.some((p) => p.soldByWeight)).toBe(true);
    expect(products.some((p) => p.deposit)).toBe(true);
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

  it('offers a free sample on a few products, one per customer', () => {
    const samples = variants.filter((v) => v.isTrial);
    expect(samples.length).toBeGreaterThanOrEqual(4);
    for (const s of samples) {
      expect(s.priceCents).toBe(0);
      expect(s.isDefault).toBe(false);
    }
  });

  it('has about 125 variants: one per product, plus the free samples', () => {
    expect(variants.length).toBeGreaterThanOrEqual(120);
    expect(variants.length).toBeLessThan(135);
  });

  it('gives every product one photo row with alt text at 1200 x 1200', () => {
    for (const p of products) {
      const images = imageRows(p);
      expect(images).toHaveLength(1);
      for (const img of images) {
        expect(img.alt.length).toBeGreaterThan(10);
        expect(img.url).toBe(`/products/${p.categorySlug}/${p.slug}-${img.n}.webp`);
        expect([img.width, img.height]).toEqual([1200, 1200]);
      }
    }
  });

  it('forces the sold-out and low-stock fixtures onto SKUs that exist', () => {
    const skus = new Set(variants.map((v) => v.sku));
    for (const sku of Object.keys(FORCED_STOCK)) expect(skus.has(sku), sku).toBe(true);
    expect(Object.values(FORCED_STOCK).some((q) => q === 0)).toBe(true);
    expect(Object.values(FORCED_STOCK).some((q) => q > 0 && q < 5)).toBe(true);
  });

  it('produces the same stock on every run, with some sold out and some low', () => {
    const stock = stockLevels(variants.length);
    expect(stockLevels(variants.length)).toEqual(stock);
    expect(stock.every((q) => q >= 0 && q <= 120)).toBe(true);
    expect(stock.some((q) => q === 0)).toBe(true);
    expect(stock.some((q) => q > 0 && q < 5)).toBe(true);
  });

  it('spreads stock differently in every store, the same on every run', () => {
    const [mitte, prenzl, kreuzberg, neukoelln] = [0, 1, 2, 3].map((i) =>
      stockLevels(variants.length, i),
    );
    expect(stockLevels(variants.length, 3)).toEqual(neukoelln);
    expect(mitte).toEqual(stockLevels(variants.length)); // store 0 is unchanged
    expect(prenzl).not.toEqual(mitte);
    expect(kreuzberg).not.toEqual(neukoelln);
    // Somewhere a variant is out in one store and in stock in another.
    expect(mitte!.some((q, i) => q === 0 && (neukoelln![i] ?? 0) > 0)).toBe(true);
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

  it("falls back to the department's placeholder when a product has no processed image", () => {
    const first = products[0];
    if (!first) throw new Error('no products');
    const rows = imageRowsFor(first, () => false);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toBe(`/products/placeholders/${first.department}.svg`);
  });

  it('has a placeholder illustration for each department', () => {
    const publicDir = fileURLToPath(new URL('../../../../web/public', import.meta.url));
    for (const d of DEPARTMENTS) {
      expect(existsSync(`${publicDir}/products/placeholders/${d.slug}.svg`), d.slug).toBe(true);
    }
  });
});
