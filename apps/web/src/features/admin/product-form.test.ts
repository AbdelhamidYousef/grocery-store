import { describe, expect, it } from 'vitest';

import { makeAdminProduct } from '../../test/fixtures';

import {
  formatOptions,
  parseOptions,
  ProductFormSchema,
  productDefaults,
  toCreatePayload,
  toUpdatePayload,
  type ProductFormInput,
} from './product-form';

const CATEGORY = '2f6d3a52-5b2c-4d57-9a41-0d6f1f0f7a10';

function validForm(overrides: Partial<ProductFormInput> = {}): ProductFormInput {
  return {
    ...productDefaults(),
    name: 'Squeaky Duck',
    description: 'Squeaks.',
    categoryId: CATEGORY,
    variants: [
      {
        sku: 'DUCK-1',
        name: 'Yellow',
        options: 'Colour=Yellow',
        price: '9,99',
        compareAtPrice: '',
        memberPrice: '',
        weight: '120',
        stock: '5',
        lowStockThreshold: '',
        status: 'active',
      },
      {
        sku: 'DUCK-2',
        name: 'Pink',
        options: 'Colour=Pink',
        price: '10',
        compareAtPrice: '12.50',
        memberPrice: '8.95',
        weight: '120',
        stock: '0',
        lowStockThreshold: '2',
        status: 'active',
      },
    ],
    defaultVariant: '1',
    ...overrides,
  };
}

describe('options text', () => {
  it('parses key=value pairs and formats them back', () => {
    expect(parseOptions('Size=Large, Colour=Red')).toEqual({ Size: 'Large', Colour: 'Red' });
    expect(formatOptions({ Size: 'Large', Colour: 'Red' })).toBe('Size=Large, Colour=Red');
    expect(parseOptions('')).toEqual({});
  });

  it('refuses a pair with no value or no key', () => {
    expect(parseOptions('Size=')).toBeNull();
    expect(parseOptions('=Large')).toBeNull();
    expect(parseOptions('Size')).toBeNull();
  });
});

describe('product form', () => {
  it('turns typed text into the create payload, with integer cents', () => {
    const result = ProductFormSchema.safeParse(validForm());
    expect(result.success).toBe(true);
    if (!result.success) return;
    const payload = toCreatePayload(result.data);
    expect(payload.variants).toEqual([
      expect.objectContaining({ sku: 'DUCK-1', priceCents: 999, isDefault: false, stock: 5 }),
      expect.objectContaining({
        sku: 'DUCK-2',
        priceCents: 1000,
        compareAtPriceCents: 1250,
        memberPriceCents: 895,
        isDefault: true,
        lowStockThreshold: 2,
      }),
    ]);
    expect(payload.attributes).toEqual({});
  });

  it('falls back to the first variant when the default radio points past the end', () => {
    const result = ProductFormSchema.safeParse(validForm({ defaultVariant: '7' }));
    if (!result.success) throw new Error('expected valid');
    expect(toCreatePayload(result.data).variants.map((v) => v.isDefault)).toEqual([true, false]);
  });

  it('puts each problem on its own field with the shared rule messages', () => {
    const form = validForm({
      name: '',
      categoryId: '',
      variants: [
        {
          ...validForm().variants[0]!,
          sku: 'bad sku!',
          price: 'abc',
          compareAtPrice: '5',
        },
      ],
    });
    const result = ProductFormSchema.safeParse(form);
    expect(result.success).toBe(false);
    if (result.success) return;
    const byPath = new Map(result.error.issues.map((i) => [i.path.join('.'), i.message]));
    expect(byPath.get('name')).toBeDefined();
    expect(byPath.get('categoryId')).toBe('Choose a category');
    expect(byPath.get('variants.0.sku')).toBe('Letters, digits, dot, dash and underscore only');
    expect(byPath.get('variants.0.price')).toBe('Enter an amount like 12.99');
  });

  it('refuses a strike-through price that is not above the price', () => {
    const base = validForm().variants[0]!;
    const result = ProductFormSchema.safeParse(
      validForm({ variants: [{ ...base, price: '10', compareAtPrice: '10' }] }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path.join('.')).toBe('variants.0.compareAtPrice');
  });

  it('parses the member price into integer cents, and refuses one that is not below the price', () => {
    const base = validForm().variants[0]!;
    const ok = ProductFormSchema.safeParse(
      validForm({ variants: [{ ...base, price: '10', memberPrice: '9.05' }] }),
    );
    expect(ok.success).toBe(true);
    if (ok.success) expect(toCreatePayload(ok.data).variants[0]?.memberPriceCents).toBe(905);
    const bad = ProductFormSchema.safeParse(
      validForm({ variants: [{ ...base, price: '10', memberPrice: '10' }] }),
    );
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.path.join('.')).toBe('variants.0.memberPrice');
  });

  it('rejects an attribute outside the allowed values', () => {
    const form = validForm();
    form.attributes.storage = 'lukewarm';
    expect(ProductFormSchema.safeParse(form).success).toBe(false);
  });

  it('round-trips an existing product into an update payload', () => {
    const product = makeAdminProduct();
    const result = ProductFormSchema.safeParse(productDefaults(product));
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    const payload = toUpdatePayload(result.data);
    expect(payload).toMatchObject({
      name: 'Rope Tug',
      categoryId: CATEGORY,
      status: 'active',
      attributes: { storage: 'chilled', optionKeys: ['Colour', 'Size'] },
    });
    expect(payload.images).toEqual([
      { url: '/products/cheese/rope-tug-1.webp', alt: 'Rope tug', width: 1200, height: 1200 },
    ]);
  });

  it('ties an existing image to its variant by SKU', () => {
    const product = makeAdminProduct({
      images: [
        {
          id: 'i2',
          url: '/products/x.webp',
          alt: 'x',
          width: 10,
          height: 10,
          variantId: 'v2',
          sortOrder: 0,
        },
      ],
    });
    expect(productDefaults(product).images[0]?.variantSku).toBe('TUG-RED-L');
  });
});
