import { describe, expect, it } from 'vitest';

import {
  bestMatches,
  cappedSwapCents,
  isSafeSubstitute,
  lineShareCents,
  swapUnitCents,
  withinPriceBand,
  type SubstitutionProduct,
} from './substitutions.ts';

const make = (over: Partial<SubstitutionProduct> & { variantId: string }): SubstitutionProduct => ({
  productId: `p-${over.variantId}`,
  categoryId: 'yoghurt',
  priceCents: 200,
  allergens: [],
  dietary: [],
  isFood: true,
  available: 5,
  ...over,
});

describe('withinPriceBand', () => {
  it.each([
    [200, 260, true],
    [200, 261, false],
    [200, 140, true],
    [200, 139, false],
    [199, 258, true],
    [199, 259, false],
  ])('original %i, candidate %i -> %s', (o, c, ok) => {
    expect(withinPriceBand(o, c)).toBe(ok);
  });
});

describe('isSafeSubstitute', () => {
  const oat = make({ variantId: 'o', allergens: ['gluten'], dietary: ['vegan'] });

  it('refuses an allergen the original does not declare', () => {
    expect(
      isSafeSubstitute(
        oat,
        make({ variantId: 'c', allergens: ['gluten', 'nuts'], dietary: ['vegan'] }),
      ),
    ).toBe(false);
  });
  it('allows fewer allergens than the original', () => {
    expect(isSafeSubstitute(oat, make({ variantId: 'c', allergens: [], dietary: ['vegan'] }))).toBe(
      true,
    );
  });
  it('keeps every dietary tag: vegan stays vegan', () => {
    expect(
      isSafeSubstitute(
        oat,
        make({ variantId: 'c', allergens: ['gluten'], dietary: ['vegetarian'] }),
      ),
    ).toBe(false);
  });
  it('may add dietary tags', () => {
    expect(
      isSafeSubstitute(
        oat,
        make({ variantId: 'c', allergens: ['gluten'], dietary: ['vegan', 'organic'] }),
      ),
    ).toBe(true);
  });
  it('ignores food rules for a non-food original', () => {
    const sponge = make({ variantId: 's', isFood: false });
    expect(
      isSafeSubstitute(sponge, make({ variantId: 'c', allergens: ['nuts'], dietary: [] })),
    ).toBe(true);
  });
});

describe('bestMatches', () => {
  const original = make({
    variantId: 'orig',
    priceCents: 200,
    allergens: ['milk'],
    dietary: ['vegetarian'],
  });

  it('only returns safe, same-subcategory, in-band, in-stock candidates', () => {
    const good = make({
      variantId: 'good',
      priceCents: 210,
      allergens: ['milk'],
      dietary: ['vegetarian'],
    });
    const result = bestMatches(original, [
      good,
      make({
        variantId: 'nuts',
        priceCents: 200,
        allergens: ['milk', 'nuts'],
        dietary: ['vegetarian'],
      }),
      make({ variantId: 'meat', priceCents: 200, allergens: ['milk'], dietary: [] }),
      make({
        variantId: 'other-cat',
        categoryId: 'cheese',
        priceCents: 200,
        allergens: ['milk'],
        dietary: ['vegetarian'],
      }),
      make({ variantId: 'pricey', priceCents: 300, allergens: ['milk'], dietary: ['vegetarian'] }),
      make({ variantId: 'gone', available: 0, allergens: ['milk'], dietary: ['vegetarian'] }),
      make({ variantId: 'orig', allergens: ['milk'], dietary: ['vegetarian'] }),
    ]);
    expect(result.map((r) => r.variantId)).toEqual(['good']);
  });

  it('ranks by closest price, then cheaper, then id', () => {
    const base = { allergens: ['milk'], dietary: ['vegetarian'] };
    const result = bestMatches(original, [
      make({ variantId: 'c', priceCents: 240, ...base }),
      make({ variantId: 'b', priceCents: 190, ...base }),
      make({ variantId: 'a', priceCents: 210, ...base }),
      make({ variantId: 'd', priceCents: 200, ...base }),
    ]);
    expect(result.map((r) => r.variantId)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('cuts the list at the limit (default 5)', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      make({
        variantId: `v${i}`,
        priceCents: 200 + i,
        allergens: ['milk'],
        dietary: ['vegetarian'],
      }),
    );
    expect(bestMatches(original, many)).toHaveLength(5);
    expect(bestMatches(original, many, 2)).toHaveLength(2);
  });

  it('a non-food original takes any non-food candidate of its subcategory', () => {
    const sponge = make({ variantId: 's', isFood: false, categoryId: 'cleaning', priceCents: 300 });
    const result = bestMatches(sponge, [
      make({
        variantId: 'c',
        isFood: false,
        categoryId: 'cleaning',
        priceCents: 320,
        allergens: ['nuts'],
      }),
    ]);
    expect(result.map((r) => r.variantId)).toEqual(['c']);
  });
});

describe('swap prices', () => {
  it('charges the lower of the two unit prices', () => {
    expect(swapUnitCents(250, 320)).toBe(250);
    expect(swapUnitCents(250, 199)).toBe(199);
  });
  it('caps a weighed substitute at the price of the original units', () => {
    expect(cappedSwapCents(250, 2, 610)).toBe(500);
    expect(cappedSwapCents(250, 2, 480)).toBe(480);
  });
});

describe('lineShareCents', () => {
  it('rounds half up, once', () => {
    expect(lineShareCents(600, 1, 3)).toBe(200);
    expect(lineShareCents(100, 1, 3)).toBe(33);
    expect(lineShareCents(250, 1, 3)).toBe(83);
    expect(lineShareCents(250, 2, 3)).toBe(167);
    expect(lineShareCents(7, 1, 2)).toBe(4);
    expect(lineShareCents(500, 0, 3)).toBe(0);
    expect(lineShareCents(500, 3, 3)).toBe(500);
  });
});
