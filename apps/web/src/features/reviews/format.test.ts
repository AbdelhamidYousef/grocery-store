import { describe, expect, it } from 'vitest';

import {
  formatPetAge,
  formatPetWeight,
  formatRating,
  petContextLine,
  viewFromSearch,
  withView,
} from './format';

describe('review formatting', () => {
  it.each([
    [46, '4.6'],
    [50, '5.0'],
    [5, '0.5'],
    [0, '0.0'],
  ])('formats %i tenths as %s', (tenths, text) => {
    expect(formatRating(tenths)).toBe(text);
  });

  it.each([
    [1, '1 month'],
    [8, '8 months'],
    [12, '1 year'],
    [30, '2 years 6 months'],
    [37, '3 years 1 month'],
  ])('formats %i months as "%s"', (months, text) => {
    expect(formatPetAge(months)).toBe(text);
  });

  it.each([
    [800, '800 g'],
    [4500, '4.5 kg'],
    [12_000, '12 kg'],
    [11_960, '12 kg'],
    [4_040, '4 kg'],
  ])('formats %i g as "%s"', (g, text) => {
    expect(formatPetWeight(g)).toBe(text);
  });

  it('writes a pet context line from what was shared, or nothing', () => {
    expect(petContextLine({ petAgeMonths: 30, petWeightG: 4500, sizePurchased: 'M' })).toBe(
      'Pet age 2 years 6 months, weighs 4.5 kg, bought size M',
    );
    expect(
      petContextLine({ petAgeMonths: null, petWeightG: null, sizePurchased: null }),
    ).toBeNull();
  });
});

describe('review URL state', () => {
  it('reads sort, star, topic and page, with safe defaults for junk', () => {
    expect(viewFromSearch(new URLSearchParams('rsort=newest&rstar=2&rtopic=soft&rpage=3'))).toEqual(
      {
        sort: 'newest',
        rating: 2,
        topic: 'soft',
        page: 3,
      },
    );
    expect(viewFromSearch(new URLSearchParams('rsort=evil&rstar=9&rpage=-4'))).toEqual({
      sort: 'helpful',
      rating: undefined,
      topic: undefined,
      page: 1,
    });
  });

  it('writes changes, drops defaults, keeps unrelated params, and resets the page on a filter', () => {
    const start = new URLSearchParams('variant=SKU1&rpage=4');
    expect(withView(start, { sort: 'photos' }).toString()).toBe('variant=SKU1&rsort=photos');
    expect(withView(start, { rating: 1 }).toString()).toBe('variant=SKU1&rstar=1');
    expect(withView(start, { page: 2 }).toString()).toBe('variant=SKU1&rpage=2');
    const filtered = new URLSearchParams('rstar=1&rsort=newest');
    expect(withView(filtered, { rating: undefined, sort: 'helpful' }).toString()).toBe('');
  });
});
