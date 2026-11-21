// Worked examples for the /developers page, one per tool. The inputs are checked against each
// tool's Zod schema in a test, so a schema change that breaks an example fails the build and the
// page cannot document an input the tool would reject. Outputs are illustrative (ids shortened).
export interface ToolExample {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

const money = (cents: number, formatted: string) => ({ cents, formatted, currency: 'EUR' });

export const TOOL_EXAMPLES: Record<string, ToolExample> = {
  search_catalog: {
    input: { query: 'rope toy', maxPriceCents: 2000, limit: 3 },
    output: {
      total: 1,
      products: [
        {
          id: 'a1b2…',
          slug: 'rope-tug',
          name: 'Rope Tug',
          brand: null,
          category: 'cheese',
          priceFrom: money(1099, '€10.99'),
          priceTo: money(1899, '€18.99'),
          inStock: true,
          url: '/products/rope-tug',
        },
      ],
    },
  },
  get_product: {
    input: { slug: 'rope-tug' },
    output: {
      slug: 'rope-tug',
      name: 'Rope Tug',
      inStock: true,
      variants: [
        {
          variantId: '2f6d3a52-5b2c-4d57-9a41-0d6f1f0f7a10',
          name: 'Red · Small',
          price: money(1099, '€10.99'),
          available: true,
        },
      ],
    },
  },
  add_to_cart: {
    input: { variantId: '2f6d3a52-5b2c-4d57-9a41-0d6f1f0f7a10', quantity: 2 },
    output: {
      itemCount: 2,
      lines: [{ itemId: 'l1', product: 'Rope Tug', quantity: 2, lineTotal: money(2198, '€21.98') }],
      total: money(2198, '€21.98'),
      nextStep: 'Ask the shopper to review the cart at /cart and pay themselves.',
    },
  },
  get_cart: {
    input: {},
    output: { itemCount: 2, lines: ['…'], total: money(2198, '€21.98') },
  },
  update_cart_lines: {
    input: { lines: [{ itemId: 'l1', quantity: 0 }] },
    output: { itemCount: 0, lines: [], total: money(0, '€0.00') },
  },
  search_shop_policies_and_faqs: {
    input: { query: 'how long do I have to return an item', topic: 'returns' },
    output: {
      results: [
        {
          title: 'How long do I have to return an item?',
          topic: 'returns',
          answer: '…',
          url: '/help?topic=returns&q=…',
        },
      ],
    },
  },
};
