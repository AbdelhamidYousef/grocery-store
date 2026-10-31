import { describe, expect, it } from 'vitest';

import { collections, windowDates } from './collections.ts';
import { COLOR_HEX, expandVariants } from './expand.ts';
import type { ProductSeed } from './expand.ts';
import { products } from './products.ts';
import { SeedValidationError, validateSeed } from './schema.ts';

const good = products[0] as ProductSeed;
const bad = (patch: Partial<ProductSeed>): ProductSeed => ({ ...good, ...patch });

describe('seed validation', () => {
  it('accepts the shipped catalogue', () => {
    expect(() => validateSeed(products)).not.toThrow();
  });

  it.each([
    ['a price in euros instead of cents', bad({ basePriceCents: 8.99 }), 'basePriceCents'],
    ['a slug with a space', bad({ slug: 'bad slug' }), 'slug'],
    ['a missing description', bad({ description: '' }), 'description'],
    ['an unknown pet', bad({ pet: 'dragon' as never }), 'pet'],
    ['an unknown category', bad({ categorySlug: 'nope' }), 'unknown category'],
    ['an unknown brand', bad({ brand: 'acme' }), 'unknown brand'],
    ['an unknown tag', bad({ tags: ['vibes'] }), 'unknown tag'],
    ['a computed collection named on a product', bad({ collections: ['eco-picks'] }), 'collection'],
    ['a duplicate slug', good, 'duplicate slug'],
  ])('rejects %s, naming the product', (_name, product, fragment) => {
    const list = fragment === 'duplicate slug' ? [good, good] : [product];
    expect(() => validateSeed(list)).toThrow(SeedValidationError);
    expect(() => validateSeed(list)).toThrow(new RegExp(`${good.slug}.*${fragment}|${fragment}`));
  });
});

describe('seed variant facts', () => {
  const variants = products.flatMap((p) => expandVariants(p).map((v) => ({ p, v })));

  it('has a swatch for every colour and only colour variants carry one', () => {
    for (const { p, v } of variants) {
      const colour = v.options.color;
      if (colour) {
        expect(COLOR_HEX[colour], `${p.slug} ${colour}`).toMatch(/^#[0-9A-F]{6}$/i);
        expect(v.swatchHex).toBe(COLOR_HEX[colour]);
      } else expect(v.swatchHex).toBeNull();
    }
  });

  it('pairs net amount with unit and prices samples as trial variants', () => {
    for (const { v } of variants) {
      expect(v.netAmount === null).toBe(v.netUnit === null);
      if (v.isTrial) {
        expect(v.options.pack).toBe('trial');
        expect(v.netAmount).toBeLessThanOrEqual(60);
        expect(v.compareAtPriceCents).toBeNull();
      }
    }
    expect(variants.some(({ v }) => v.isTrial)).toBe(true);
  });

  it('keeps variant options unique within a product', () => {
    for (const p of products) {
      const keys = expandVariants(p).map((v) => JSON.stringify(v.options));
      expect(new Set(keys).size, p.slug).toBe(keys.length);
    }
  });
});

describe('windowDates', () => {
  const halloween = collections.find((c) => c.slug === 'halloween')?.window;
  const christmas = collections.find((c) => c.slug === 'christmas')?.window;
  if (!halloween || !christmas) throw new Error('missing window');

  it('covers the whole last day of the window', () => {
    const { endsAt } = windowDates(halloween, new Date('2026-10-31T00:00:00Z'));
    expect(endsAt.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });
  it('uses next year once this year is over', () => {
    expect(windowDates(christmas, new Date('2026-12-28T00:00:00Z')).startsAt.getUTCFullYear()).toBe(
      2027,
    );
  });
  it('handles a window that wraps the new year', () => {
    const wrap = { start: { month: 12, day: 20 }, end: { month: 1, day: 5 } };
    const { startsAt, endsAt } = windowDates(wrap, new Date('2026-12-25T00:00:00Z'));
    expect(startsAt.toISOString()).toBe('2026-12-20T00:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2027-01-06T00:00:00.000Z');
  });
});
