import { describe, expect, it } from 'vitest';

import { ProductListQuerySchema } from './catalog.ts';

const parse = (query: Record<string, unknown>) => ProductListQuerySchema.parse(query);

describe('ProductListQuerySchema', () => {
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
    expect(parse({ 'attr.material': 'plush,rubber', 'attr.pet': 'dog' }).attr).toEqual({
      material: ['plush', 'rubber'],
      pet: ['dog'],
    });
  });

  it('treats a repeated parameter like a comma list', () => {
    expect(parse({ 'attr.material': ['plush', 'rubber,cotton'] }).attr).toEqual({
      material: ['plush', 'rubber', 'cotton'],
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
    ['empty attribute value', { 'attr.material': ',' }],
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
