import { describe, expect, it } from 'vitest';

import { bestsellerIds, deriveBadges, type BadgeInput } from './badges.ts';

const NOW = new Date('2026-10-31T12:00:00Z');
const daysAgo = (n: number, extraMs = 0) => new Date(NOW.getTime() - n * 86_400_000 - extraMs);

const base: BadgeInput = {
  createdAt: daysAgo(200),
  badgeNewUntil: null,
  isEco: false,
  isBestseller: false,
  variants: [
    {
      priceCents: 1000,
      compareAtPriceCents: null,
      isDefault: true,
      availableUnits: 50,
      lowStockThreshold: 5,
    },
  ],
};
const with_ = (patch: Partial<BadgeInput>): BadgeInput => ({ ...base, ...patch });
const variant = (patch: Partial<BadgeInput['variants'][number]>) => ({
  ...base.variants[0]!,
  ...patch,
});

describe('deriveBadges', () => {
  it('gives an ordinary product no badges', () => {
    expect(deriveBadges(base, NOW)).toEqual([]);
  });

  describe('New', () => {
    it('is new just under 30 days, not at exactly 30 days', () => {
      expect(deriveBadges(with_({ createdAt: daysAgo(30, -1) }), NOW)).toEqual(['New']);
      expect(deriveBadges(with_({ createdAt: daysAgo(30) }), NOW)).toEqual([]);
    });
    it('honours badge_new_until until that instant', () => {
      const old = with_({ badgeNewUntil: new Date(NOW.getTime() + 1) });
      expect(deriveBadges(old, NOW)).toEqual(['New']);
      expect(deriveBadges(with_({ badgeNewUntil: NOW }), NOW)).toEqual([]);
    });
    it('does not treat a created_at in the future as new', () => {
      expect(deriveBadges(with_({ createdAt: daysAgo(-1) }), NOW)).toEqual([]);
    });
  });

  describe('Sale', () => {
    it('needs a compare-at price above the price on any variant', () => {
      const sale = with_({
        variants: [variant({ isDefault: false }), variant({ compareAtPriceCents: 1200 })],
      });
      expect(deriveBadges(sale, NOW)).toEqual(['Sale']);
      expect(
        deriveBadges(with_({ variants: [variant({ compareAtPriceCents: 1000 })] }), NOW),
      ).toEqual([]);
    });
  });

  describe('Low stock', () => {
    it('fires at the threshold, not above it, and not when sold out', () => {
      const at = (availableUnits: number) =>
        deriveBadges(with_({ variants: [variant({ availableUnits })] }), NOW);
      expect(at(6)).toEqual([]);
      expect(at(5)).toEqual(['Low stock']);
      expect(at(1)).toEqual(['Low stock']);
      expect(at(0)).toEqual([]);
    });
    it('looks only at the default variant', () => {
      const p = with_({
        variants: [variant({}), variant({ isDefault: false, availableUnits: 1 })],
      });
      expect(deriveBadges(p, NOW)).toEqual([]);
    });
  });

  it('shows Eco and Bestseller from their flags, in a fixed order', () => {
    const all = with_({
      isEco: true,
      isBestseller: true,
      createdAt: daysAgo(1),
      variants: [variant({ compareAtPriceCents: 2000, availableUnits: 2 })],
    });
    expect(deriveBadges(all, NOW)).toEqual(['Bestseller', 'New', 'Sale', 'Eco', 'Low stock']);
  });
});

describe('bestsellerIds', () => {
  const units = (o: Record<string, number>) => new Map(Object.entries(o));

  it('takes the top 10% of the catalogue, rounded up', () => {
    const u = units({ a: 50, b: 40, c: 30, d: 20, e: 10 });
    expect([...bestsellerIds(u, 20)]).toEqual(['a', 'b']);
    expect([...bestsellerIds(u, 21)]).toEqual(['a', 'b', 'c']);
    expect([...bestsellerIds(u, 1)]).toEqual(['a']);
  });
  it('includes ties at the cut-off', () => {
    expect(bestsellerIds(units({ a: 9, b: 9, c: 9, d: 1 }), 10)).toEqual(new Set(['a', 'b', 'c']));
  });
  it('ignores products with no sales and handles an empty catalogue', () => {
    expect(bestsellerIds(units({ a: 0 }), 10).size).toBe(0);
    expect(bestsellerIds(units({}), 10).size).toBe(0);
    expect(bestsellerIds(units({ a: 5 }), 0).size).toBe(0);
  });
});
