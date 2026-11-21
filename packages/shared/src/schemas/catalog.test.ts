import { describe, expect, it } from 'vitest';

import { ProductListQuerySchema } from './catalog.ts';

const parse = (query: Record<string, unknown>) => ProductListQuerySchema.parse(query);

describe('ProductListQuerySchema', () => {
  it('rejects a query that is not an object instead of crashing', () => {
    expect(ProductListQuerySchema.safeParse('?page=2').success).toBe(false);
  });

  it('applies pagination defaults', () => {
    expect(parse({})).toMatchObject({ page: 1, limit: 24, attr: {} });
  });

  it('coerces numbers and the inStock flag from strings', () => {
    expect(
      parse({ page: '2', limit: '10', minPrice: '500', maxPrice: '2000', inStock: 'true' }),
    ).toMatchObject({
      page: 2,
      limit: 10,
      minPrice: 500,
      maxPrice: 2000,
      inStock: true,
    });
    expect(parse({ inStock: 'false' }).inStock).toBe(false);
  });

  it('parses attr.<key> into a record of arrays', () => {
    expect(parse({ 'attr.storage': 'chilled,frozen', 'attr.origin': 'berlin' }).attr).toEqual({
      storage: ['chilled', 'frozen'],
      origin: ['berlin'],
    });
  });

  it('treats a repeated parameter like a comma list', () => {
    expect(parse({ 'attr.storage': ['chilled', 'frozen,ambient'] }).attr).toEqual({
      storage: ['chilled', 'frozen', 'ambient'],
    });
  });

  it('accepts every documented sort and rejects others', () => {
    for (const sort of ['relevance', 'price_asc', 'price_desc', 'newest', 'name']) {
      expect(parse({ sort }).sort).toBe(sort);
    }
    expect(() => parse({ sort: 'cheapest' })).toThrow();
  });

  it.each([
    ['page below 1', { page: '0' }],
    ['limit above 100', { limit: '101' }],
    ['non-numeric price', { minPrice: 'cheap' }],
    ['negative price', { minPrice: '-1' }],
    ['inStock that is not true/false', { inStock: 'yes' }],
    ['min above max', { minPrice: '900', maxPrice: '100' }],
    ['empty attribute value', { 'attr.storage': ',' }],
    ['attribute key with odd characters', { 'attr.a b': 'x' }],
  ])('rejects %s', (_name, query) => {
    expect(() => parse(query)).toThrow();
  });

  it('trims q and drops it when blank-only is rejected', () => {
    expect(parse({ q: '  rope ' }).q).toBe('rope');
    expect(() => parse({ q: '   ' })).toThrow();
  });

  it('ignores unknown parameters', () => {
    expect(parse({ utm_source: 'x' })).not.toHaveProperty('utm_source');
  });
});

describe('diet filter', () => {
  it('reads a comma list or a repeated parameter', () => {
    expect(parse({ diet: 'vegan,gluten-free' }).diet).toEqual(['vegan', 'gluten-free']);
    expect(parse({ diet: ['vegan', 'organic'] }).diet).toEqual(['vegan', 'organic']);
  });

  it('rejects a tag that does not exist', () => {
    expect(ProductListQuerySchema.safeParse({ diet: 'paleo' }).success).toBe(false);
  });
});
