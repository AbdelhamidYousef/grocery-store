import { describe, expect, it } from 'vitest';

import {
  AdminProductCreateSchema,
  AdminProductUpdateSchema,
  AdminVariantInputSchema,
  AdminVariantUpdateSchema,
  ImageUrlSchema,
} from '../index.ts';

describe('ImageUrlSchema', () => {
  it.each(['/products/dog/ball.webp', 'https://cdn.example.com/a.png'])('accepts %s', (v) => {
    expect(ImageUrlSchema.safeParse(v).success).toBe(true);
  });

  it.each([
    '/products/../etc/passwd',
    '/products//x',
    '/products/with space.png',
    'http://insecure.example.com/a.png',
    'javascript:alert(1)',
    '/other/path.png',
  ])('rejects %s', (v) => {
    expect(ImageUrlSchema.safeParse(v).success).toBe(false);
  });
});

describe('variant schemas', () => {
  const variant = {
    sku: 'BALL-S',
    name: 'Small',
    options: { size: 'S' },
    priceCents: 500,
    weightGrams: 80,
  };

  it('applies the defaults (stock 0, status active)', () => {
    expect(AdminVariantInputSchema.parse(variant)).toMatchObject({ stock: 0, status: 'active' });
  });

  it('rejects a strike-through price at or below the price', () => {
    for (const compareAtPriceCents of [500, 400]) {
      const r = AdminVariantInputSchema.safeParse({ ...variant, compareAtPriceCents });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(['compareAtPriceCents']);
    }
    expect(
      AdminVariantInputSchema.safeParse({ ...variant, compareAtPriceCents: 900 }).success,
    ).toBe(true);
  });

  it('rejects more than six options and a bad SKU', () => {
    const options = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`k${i}`, 'v']));
    expect(AdminVariantInputSchema.safeParse({ ...variant, options }).success).toBe(false);
    expect(AdminVariantInputSchema.safeParse({ ...variant, sku: '-bad' }).success).toBe(false);
  });

  it('accepts a partial update but not an empty one, and still checks the compare-at price', () => {
    expect(AdminVariantUpdateSchema.safeParse({ name: 'Large' }).success).toBe(true);
    expect(AdminVariantUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      AdminVariantUpdateSchema.safeParse({ priceCents: 500, compareAtPriceCents: 100 }).success,
    ).toBe(false);
  });
});

describe('product schemas', () => {
  const product = {
    name: 'Squeaky ball',
    description: 'Bounces.',
    categoryId: '0b0f6f66-3d3b-4f55-9a43-6d9a0f0d8c11',
    status: 'active',
    attributes: { pet: 'dog', material: 'rubber' },
    variants: [{ sku: 'BALL-S', name: 'Small', options: {}, priceCents: 500, weightGrams: 80 }],
  };

  it('accepts a valid product', () => {
    expect(AdminProductCreateSchema.safeParse(product).success).toBe(true);
  });

  it('rejects unknown attribute keys (a typo must not become a facet)', () => {
    const r = AdminProductCreateSchema.safeParse({ ...product, attributes: { colour: 'red' } });
    expect(r.success).toBe(false);
  });

  it('rejects a non-uuid category', () => {
    expect(AdminProductCreateSchema.safeParse({ ...product, categoryId: 'nope' }).success).toBe(
      false,
    );
  });

  it('rejects a product without variants', () => {
    expect(AdminProductCreateSchema.safeParse({ ...product, variants: [] }).success).toBe(false);
  });

  it('accepts a partial update but not an empty one', () => {
    expect(AdminProductUpdateSchema.safeParse({ name: 'New name' }).success).toBe(true);
    expect(AdminProductUpdateSchema.safeParse({}).success).toBe(false);
  });
});
