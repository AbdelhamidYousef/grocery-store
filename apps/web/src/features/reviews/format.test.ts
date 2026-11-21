import { describe, expect, it } from 'vitest';

import { formatRating, viewFromSearch, withView } from './format';

describe('review formatting', () => {
  it.each([
    [46, '4.6'],
    [50, '5.0'],
    [5, '0.5'],
    [0, '0.0'],
  ])('formats %i tenths as %s', (tenths, text) => {
    expect(formatRating(tenths)).toBe(text);
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
