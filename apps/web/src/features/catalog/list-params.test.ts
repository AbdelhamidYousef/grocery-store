import { describe, expect, it } from 'vitest';

import { applyListPatch, clearedFilters, hasActiveFilters, parseListParams } from './list-params';

const sp = (s: string) => new URLSearchParams(s);

describe('parseListParams', () => {
  it('reads sort, page, prices, stock and attribute lists from the url', () => {
    const q = parseListParams(
      sp('sort=price_asc&page=2&minPrice=500&maxPrice=2000&inStock=true&attr.material=a,b'),
    );
    expect(q).toMatchObject({
      sort: 'price_asc',
      page: 2,
      minPrice: 500,
      maxPrice: 2000,
      inStock: true,
      attr: { material: ['a', 'b'] },
    });
  });

  it('falls back to defaults when the url is empty', () => {
    expect(parseListParams(sp(''))).toMatchObject({ page: 1, attr: {} });
  });

  it('drops invalid values instead of failing', () => {
    const q = parseListParams(sp('page=abc&sort=bogus&minPrice=9&maxPrice=1&attr.material=wood'));
    expect(q.page).toBe(1);
    expect(q.sort).toBeUndefined();
    expect(q.minPrice).toBeUndefined();
    expect(q.attr).toEqual({ material: ['wood'] });
  });
});

describe('applyListPatch', () => {
  it('sets values, keeps unrelated params and resets the page', () => {
    const next = applyListPatch(sp('q=rope&page=3'), { sort: 'name' });
    expect(next.get('q')).toBe('rope');
    expect(next.get('sort')).toBe('name');
    expect(next.has('page')).toBe(false);
  });

  it('keeps an explicit page and omits page 1', () => {
    expect(applyListPatch(sp(''), { page: 3 }).get('page')).toBe('3');
    expect(applyListPatch(sp('page=3'), { page: 1 }).has('page')).toBe(false);
  });

  it('removes keys set to undefined or an empty attribute list', () => {
    const next = applyListPatch(sp('minPrice=5&inStock=true&attr.pet=dog,cat'), {
      minPrice: undefined,
      inStock: false,
      attr: { pet: [] },
    });
    expect(next.toString()).toBe('');
  });

  it('writes attribute values as one comma list', () => {
    expect(applyListPatch(sp(''), { attr: { material: ['a', 'b'] } }).get('attr.material')).toBe(
      'a,b',
    );
  });
});

describe('filters', () => {
  it('clearedFilters keeps only the search query', () => {
    expect(clearedFilters(sp('q=rope&sort=name&attr.pet=dog&page=2')).toString()).toBe('q=rope');
  });

  it('hasActiveFilters ignores sort and page', () => {
    expect(hasActiveFilters(parseListParams(sp('sort=name&page=2')))).toBe(false);
    expect(hasActiveFilters(parseListParams(sp('inStock=true')))).toBe(true);
    expect(hasActiveFilters(parseListParams(sp('attr.pet=dog')))).toBe(true);
  });
});

describe('brand and tag parameters', () => {
  it('parses them as slug lists and applies and clears patches', () => {
    const query = parseListParams(new URLSearchParams('brand=a,b&tag=joints'));
    expect(query.brand).toEqual(['a', 'b']);
    expect(query.tag).toEqual(['joints']);

    const added = applyListPatch(new URLSearchParams('page=3'), { brand: ['a'], tag: ['joints'] });
    expect(added.toString()).toBe('brand=a&tag=joints');
    const cleared = applyListPatch(added, { brand: [] });
    expect(cleared.toString()).toBe('tag=joints');
  });

  it('counts them as active filters', () => {
    expect(hasActiveFilters(parseListParams(new URLSearchParams('brand=a')))).toBe(true);
    expect(hasActiveFilters(parseListParams(new URLSearchParams('tag=x')))).toBe(true);
  });

  it('drops an invalid badge instead of failing the page', () => {
    expect(parseListParams(new URLSearchParams('badge=shiny&brand=a')).brand).toEqual(['a']);
  });
});
