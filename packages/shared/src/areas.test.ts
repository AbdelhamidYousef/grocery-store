import { describe, expect, it } from 'vitest';

import { PostcodeLookupSchema, postcodeSchema } from './areas.ts';

describe('postcodeSchema', () => {
  it.each(['10115', '01067', '12043'])('accepts %s', (code) => {
    expect(postcodeSchema.safeParse(code).success).toBe(true);
  });

  it.each(['1011', '101155', 'abcde', '10 15', '', '10115 '])('rejects %j', (code) => {
    expect(postcodeSchema.safeParse(code).success).toBe(false);
  });
});

describe('PostcodeLookupSchema', () => {
  it('reads a served postcode with its area and store', () => {
    const r = PostcodeLookupSchema.parse({
      postcode: '10115',
      served: true,
      area: { slug: 'mitte', name: 'Mitte' },
      store: { slug: 'mitte', name: 'Grocery Mitte' },
    });
    expect(r.served).toBe(true);
  });

  it('reads an unserved postcode without area or store', () => {
    expect(PostcodeLookupSchema.parse({ postcode: '80331', served: false })).toEqual({
      postcode: '80331',
      served: false,
    });
  });

  it('refuses a served postcode that names no area', () => {
    expect(PostcodeLookupSchema.safeParse({ postcode: '10115', served: true }).success).toBe(false);
  });
});
