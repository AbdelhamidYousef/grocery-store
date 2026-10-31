import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { optionalText, PaginationQuerySchema, requiredText } from '../index.ts';

describe('optionalText', () => {
  const schema = z.object({ note: optionalText(5) });

  it('keeps undefined (a PATCH leaves the field alone)', () => {
    expect(schema.parse({}).note).toBeUndefined();
  });

  it('turns empty, whitespace and null into null', () => {
    expect(schema.parse({ note: '' }).note).toBeNull();
    expect(schema.parse({ note: '   ' }).note).toBeNull();
    expect(schema.parse({ note: null }).note).toBeNull();
  });

  it('trims and enforces the maximum', () => {
    expect(schema.parse({ note: ' hi ' }).note).toBe('hi');
    expect(schema.safeParse({ note: 'toolong' }).success).toBe(false);
  });
});

describe('requiredText', () => {
  it('rejects blank text', () => {
    expect(requiredText(10).safeParse('  ').success).toBe(false);
  });
});

describe('PaginationQuerySchema', () => {
  it('defaults to page 1 with 24 per page and coerces strings', () => {
    expect(PaginationQuerySchema.parse({})).toEqual({ page: 1, limit: 24 });
    expect(PaginationQuerySchema.parse({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10 });
  });

  it.each([{ page: '0' }, { limit: '101' }, { page: '1.5' }])('rejects %o', (q) => {
    expect(PaginationQuerySchema.safeParse(q).success).toBe(false);
  });
});
