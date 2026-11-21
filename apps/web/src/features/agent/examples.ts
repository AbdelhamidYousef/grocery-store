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
    input: { query: 'milk', maxPriceCents: 300, limit: 3 },
    output: {
      total: 1,
      products: [
        {
          id: 'a1b2…',
          slug: 'whole-milk-1l',
          name: 'Whole milk, 1 l',
          brand: 'Meadowbrook Dairy',
          category: 'milk-cream',
          priceFrom: money(129, '€1.29'),
          priceTo: money(129, '€1.29'),
          inStock: true,
          url: '/products/whole-milk-1l',
        },
      ],
    },
  },
  get_product: {
    input: { slug: 'whole-milk-1l' },
    output: {
      slug: 'whole-milk-1l',
      name: 'Whole milk, 1 l',
      inStock: true,
      variants: [
        {
          variantId: '2f6d3a52-5b2c-4d57-9a41-0d6f1f0f7a10',
          name: '1 l',
          price: money(129, '€1.29'),
          available: true,
        },
      ],
    },
  },
  add_to_cart: {
    input: { variantId: '2f6d3a52-5b2c-4d57-9a41-0d6f1f0f7a10', quantity: 2 },
    output: {
      itemCount: 2,
      lines: [
        { itemId: 'l1', product: 'Whole milk, 1 l', quantity: 2, lineTotal: money(258, '€2.58') },
      ],
      total: money(258, '€2.58'),
      nextStep: 'Ask the shopper to review the cart at /cart and pay themselves.',
    },
  },
  get_cart: {
    input: {},
    output: { itemCount: 2, lines: ['…'], total: money(258, '€2.58') },
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
