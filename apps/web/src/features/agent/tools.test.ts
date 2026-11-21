import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../api/client';
import {
  makeCard,
  makeCart,
  makeCartItem,
  makeList,
  makeProduct,
  makeVariant,
} from '../../test/fixtures';

import {
  AGENT_TOOLS,
  addToCart,
  getCart,
  getProduct,
  searchCatalog,
  searchPoliciesAndFaqs,
  updateCartLines,
} from './tools';

const api = vi.hoisted(() => ({
  addCartItem: vi.fn(),
  fetchCart: vi.fn(),
  removeCartItem: vi.fn(),
  updateCartItem: vi.fn(),
  fetchProduct: vi.fn(),
  fetchProducts: vi.fn(),
  searchHelp: vi.fn(),
}));
vi.mock('../../api/cart', () => api);
vi.mock('../../api/catalog', () => api);
vi.mock('../../api/help', () => api);

const VARIANT = '2f6d3a52-5b2c-4d57-9a41-0d6f1f0f7a10';

beforeEach(() => vi.resetAllMocks());

describe('agent tool registry', () => {
  it('has unique snake_case names and a description each', () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of AGENT_TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('exposes no checkout, payment, order or account tool', () => {
    expect(AGENT_TOOLS.map((t) => t.name).join(' ')).not.toMatch(
      /checkout|pay|order|account|login|address/,
    );
  });
});

describe('search_catalog', () => {
  it('accepts filters and rejects a limit above 24', () => {
    const s = searchCatalog.inputSchema;
    expect(s.safeParse({ query: 'rope', category: 'cheese', maxPriceCents: 2000 }).success).toBe(
      true,
    );
    expect(s.safeParse({ limit: 25 }).success).toBe(false);
    expect(s.safeParse({ maxPriceCents: 1.5 }).success).toBe(false);
  });

  it('calls fetchProducts and returns compact cards with money in cents', async () => {
    api.fetchProducts.mockResolvedValue(
      makeList([makeCard({ id: 'p1', slug: 'rope-tug', name: 'Rope Tug' })]),
    );
    const result = (await searchCatalog.execute({ query: 'rope', brand: 'tug-co', limit: 5 })) as {
      total: number;
      products: { slug: string; priceFrom: { cents: number; formatted: string } }[];
    };
    expect(api.fetchProducts).toHaveBeenCalledWith({
      q: 'rope',
      category: undefined,
      brand: ['tug-co'],
      maxPrice: undefined,
      limit: 5,
    });
    expect(result.products[0]?.slug).toBe('rope-tug');
    expect(result.products[0]?.priceFrom).toMatchObject({ cents: 1099 });
    expect(result.products[0]?.priceFrom.formatted).toContain('10.99');
  });
});

describe('get_product', () => {
  it('rejects an empty slug', async () => {
    expect(await getProduct.execute({ slug: '' })).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(api.fetchProduct).not.toHaveBeenCalled();
  });

  it('returns variants with the ids add_to_cart needs', async () => {
    api.fetchProduct.mockResolvedValue(
      makeProduct({ variants: [makeVariant({ id: VARIANT, available: false })] }),
    );
    const result = (await getProduct.execute({ slug: 'rope-tug' })) as {
      variants: { variantId: string; available: boolean }[];
    };
    expect(api.fetchProduct).toHaveBeenCalledWith('rope-tug');
    expect(result.variants).toMatchObject([{ variantId: VARIANT, available: false }]);
  });

  it('turns a 404 into a coded error without a stack trace', async () => {
    api.fetchProduct.mockRejectedValue(new ApiError('NOT_FOUND', 404, 'Product not found'));
    expect(await getProduct.execute({ slug: 'nope' })).toEqual({
      error: { code: 'NOT_FOUND', message: 'Product not found' },
    });
  });
});

describe('add_to_cart', () => {
  it('accepts a uuid and 1..99, rejects the rest', () => {
    const s = addToCart.inputSchema;
    expect(s.safeParse({ variantId: VARIANT, quantity: 99 }).success).toBe(true);
    expect(s.safeParse({ variantId: VARIANT, quantity: 100 }).success).toBe(false);
    expect(s.safeParse({ variantId: VARIANT, quantity: 0 }).success).toBe(false);
    expect(s.safeParse({ variantId: 'v1', quantity: 1 }).success).toBe(false);
  });

  it('calls addCartItem and returns the priced cart with a hand-over note', async () => {
    api.addCartItem.mockResolvedValue(makeCart([makeCartItem({ variantId: VARIANT })]));
    const input = { variantId: VARIANT, quantity: 2 };
    const result = await addToCart.execute(input);
    expect(api.addCartItem).toHaveBeenCalledWith(input);
    expect(result).toMatchObject({
      itemCount: 1,
      lines: [{ product: 'Rope Tug', unitPrice: { cents: 1099 } }],
      nextStep: expect.stringContaining('pay themselves') as string,
    });
    expect(addToCart.describe(input, result)).toBe('Assistant added Rope Tug to your cart');
  });

  it('passes API codes such as OUT_OF_STOCK through', async () => {
    api.addCartItem.mockRejectedValue(new ApiError('OUT_OF_STOCK', 409, 'Only 1 left'));
    const result = await addToCart.execute({ variantId: VARIANT, quantity: 5 });
    expect(result).toEqual({ error: { code: 'OUT_OF_STOCK', message: 'Only 1 left' } });
    expect(addToCart.describe({}, result)).toBeNull();
  });

  it('hides unexpected errors behind INTERNAL', async () => {
    api.addCartItem.mockRejectedValue(new TypeError('boom at line 42'));
    expect(await addToCart.execute({ variantId: VARIANT, quantity: 1 })).toEqual({
      error: { code: 'INTERNAL', message: expect.not.stringContaining('boom') as string },
    });
  });
});

describe('get_cart', () => {
  it('takes no arguments and reads the cart', async () => {
    api.fetchCart.mockResolvedValue(makeCart());
    expect(getCart.inputSchema.safeParse({}).success).toBe(true);
    expect(await getCart.execute(undefined)).toMatchObject({ itemCount: 0, lines: [] });
    expect(api.fetchCart).toHaveBeenCalledTimes(1);
  });
});

describe('update_cart_lines', () => {
  it('rejects an empty list, too many lines and a quantity above 99', () => {
    const s = updateCartLines.inputSchema;
    expect(s.safeParse({ lines: [] }).success).toBe(false);
    expect(s.safeParse({ lines: [{ itemId: 'l1', quantity: 100 }] }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => ({ itemId: `l${i}`, quantity: 1 }));
    expect(s.safeParse({ lines: many }).success).toBe(false);
  });

  it('removes at quantity 0 and updates otherwise, in order', async () => {
    api.removeCartItem.mockResolvedValue(makeCart());
    api.updateCartItem.mockResolvedValue(makeCart([makeCartItem({ quantity: 3 })]));
    const result = await updateCartLines.execute({
      lines: [
        { itemId: 'a', quantity: 0 },
        { itemId: 'b', quantity: 3 },
      ],
    });
    expect(api.removeCartItem).toHaveBeenCalledWith('a');
    expect(api.updateCartItem).toHaveBeenCalledWith('b', { quantity: 3 });
    expect(result).toMatchObject({ itemCount: 3 });
  });

  it('stops at the first failing line', async () => {
    api.updateCartItem.mockRejectedValueOnce(new ApiError('CART_CHANGED', 409, 'Cart changed'));
    const result = await updateCartLines.execute({
      lines: [
        { itemId: 'a', quantity: 2 },
        { itemId: 'b', quantity: 2 },
      ],
    });
    expect(result).toMatchObject({ error: { code: 'CART_CHANGED' } });
    expect(api.updateCartItem).toHaveBeenCalledTimes(1);
  });
});

describe('search_shop_policies_and_faqs', () => {
  it('needs a query and only accepts a known topic', () => {
    const s = searchPoliciesAndFaqs.inputSchema;
    expect(s.safeParse({ query: 'returns' }).success).toBe(true);
    expect(s.safeParse({ query: '' }).success).toBe(false);
    expect(s.safeParse({ query: 'x', topic: 'weather' }).success).toBe(false);
  });

  it('calls searchHelp and returns title, answer text and a help page URL', async () => {
    api.searchHelp.mockResolvedValue([
      {
        slug: 'return-window',
        topic: 'returns',
        question: 'How long do I have to return?',
        answerMd: 'You have 30 days.',
        snippet: null,
      },
    ]);
    const result = await searchPoliciesAndFaqs.execute({ query: 'return', topic: 'returns' });
    expect(api.searchHelp).toHaveBeenCalledWith({ q: 'return', topic: 'returns' });
    expect(result).toEqual({
      results: [
        {
          title: 'How long do I have to return?',
          topic: 'returns',
          answer: 'You have 30 days.',
          url: '/help?topic=returns&q=How%20long%20do%20I%20have%20to%20return%3F',
        },
      ],
    });
  });
});
