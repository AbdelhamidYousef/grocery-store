import { HelpTopicSchema, MAX_LINE_QUANTITY, formatMoney } from '@store/shared';
import { z } from 'zod';

import {
  addCartItem,
  fetchCart,
  removeCartItem,
  updateCartItem,
  type WebCart,
} from '../../api/cart';
import { fetchProduct, fetchProducts } from '../../api/catalog';
import { ApiError } from '../../api/client';
import { searchHelp } from '../../api/help';

// The six tools a browser AI agent may call (phase 24). Each one is a thin wrapper over the typed API
// client the pages already use, so an agent can never do what a shopper cannot: the same
// validation, stock rules, trial limits, CSRF/origin check and rate limits apply on the server.
// Deliberately absent: checkout, payment, account and order data. An agent fills the cart and
// hands over to the human ("review and pay").

export interface AgentError {
  error: { code: string; message: string };
}

export interface AgentTool {
  name: string;
  description: string;
  /** Zod is the single source: validation here, JSON Schema for the registration. */
  inputSchema: z.ZodType;
  /** Reads only; the adapter marks these `readOnlyHint` and shows no toast. */
  readOnly: boolean;
  /** Validates `input` (an agent is an untrusted caller) and never throws. */
  execute: (input: unknown) => Promise<unknown>;
  /** Plain-text note of what a cart tool just did, for the visible toast; null for reads. */
  describe: (input: unknown, result: unknown) => string | null;
}

const fail = (code: string, message: string): AgentError => ({ error: { code, message } });

// Errors reach an agent as { code, message } using the API's own codes; anything unexpected is a
// generic INTERNAL so no stack trace or internal detail leaks.
export function toAgentError(cause: unknown): AgentError {
  if (cause instanceof ApiError) return fail(cause.code, cause.message);
  return fail('INTERNAL', 'The tool failed unexpectedly. Try again later.');
}

export const isAgentError = (value: unknown): value is AgentError =>
  typeof value === 'object' && value !== null && 'error' in value;

function defineTool<S extends z.ZodType, R>(def: {
  name: string;
  description: string;
  inputSchema: S;
  readOnly: boolean;
  run: (input: z.output<S>) => Promise<R>;
  describe?: (input: z.output<S>, result: R) => string | null;
}): AgentTool {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    readOnly: def.readOnly,
    async execute(raw) {
      const parsed = def.inputSchema.safeParse(raw ?? {});
      if (!parsed.success) {
        return fail('VALIDATION_ERROR', z.prettifyError(parsed.error));
      }
      try {
        return await def.run(parsed.data);
      } catch (cause) {
        return toAgentError(cause);
      }
    },
    describe: (input, result) =>
      def.describe && !isAgentError(result)
        ? def.describe(input as z.output<S>, result as R)
        : null,
  };
}

// ---------- compact shapes ----------

const money = (cents: number, currency: string) => ({
  cents,
  formatted: formatMoney(cents, currency),
  currency,
});

export function compactCart(cart: WebCart) {
  const { pricing } = cart;
  return {
    currency: cart.currency,
    itemCount: cart.itemCount,
    lines: cart.items.map((i) => ({
      itemId: i.id,
      variantId: i.variantId,
      product: i.productName,
      variant: i.variantName,
      unitPrice: money(i.unitPriceCents, cart.currency),
      quantity: i.quantity,
      lineTotal: money(i.lineTotalCents, cart.currency),
      available: i.available > 0,
      maxQuantity: i.maxQty,
    })),
    adjustments: pricing.adjustments.map((a) => ({
      label: a.label,
      amount: money(a.cents, cart.currency),
    })),
    subtotal: money(cart.subtotalCents, cart.currency),
    discount: money(pricing.discountCents, cart.currency),
    shippingEstimate: money(pricing.shippingEstimateCents, cart.currency),
    total: money(pricing.totalEstimateCents, cart.currency),
    warnings: cart.warnings.map((w) => ({ code: w.code, product: w.productName })),
    // The hand-over: an agent never pays; the shopper reviews the cart and checks out.
    nextStep: 'Ask the shopper to review the cart at /cart and pay themselves.',
  };
}

const productUrl = (slug: string) => `/products/${slug}`;
const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

// ---------- the six tools ----------

const SEARCH_LIMIT_MAX = 24;
const CART_LINES_MAX = 20;

export const searchCatalog = defineTool({
  name: 'search_catalog',
  description:
    'Search the Grocery catalogue. Returns compact product cards (id, slug, name, ' +
    'price range in cents, in-stock flag). Use get_product for variants and their ids.',
  inputSchema: z.object({
    query: z.string().trim().max(100).optional().describe('Free-text search, e.g. "milk".'),
    category: z.string().trim().max(80).optional().describe('Category slug, e.g. "cheese".'),
    brand: z.string().trim().max(80).optional().describe('Brand slug.'),
    maxPriceCents: z.number().int().min(0).optional().describe('Upper price bound in cents.'),
    limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).default(12),
  }),
  readOnly: true,
  async run({ query, category, brand, maxPriceCents, limit }) {
    const res = await fetchProducts({
      q: query,
      category,
      brand: brand ? [brand] : undefined,
      maxPrice: maxPriceCents,
      limit,
    });
    return {
      total: res.meta.total,
      products: res.data.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand: p.brand?.name ?? null,
        category: p.categorySlug,
        priceFrom: money(p.price.minCents, p.price.currency),
        priceTo: money(p.price.maxCents, p.price.currency),
        inStock: p.inStock,
        url: productUrl(p.slug),
      })),
    };
  },
});

export const getProduct = defineTool({
  name: 'get_product',
  description:
    'Get one product by slug with its variants. Each variant has the `variantId` that ' +
    'add_to_cart needs, its price in cents and whether it is available.',
  inputSchema: z.object({ slug: z.string().trim().min(1).max(120) }),
  readOnly: true,
  async run({ slug }) {
    const p = await fetchProduct(slug);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: truncate(p.description, 600),
      brand: p.brand?.name ?? null,
      category: p.category.name,
      inStock: p.inStock,
      variants: p.variants.map((v) => ({
        variantId: v.id,
        name: v.name,
        options: v.options,
        price: money(v.priceCents, v.currency),
        available: v.available,
        trialSize: v.isTrial,
      })),
      url: productUrl(p.slug),
    };
  },
});

export const addToCart = defineTool({
  name: 'add_to_cart',
  description:
    "Add a variant to the visitor's cart and return the priced cart. Cart only: there is no " +
    'checkout tool, the shopper reviews and pays themselves.',
  inputSchema: z.object({
    variantId: z.uuid(),
    quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
  }),
  readOnly: false,
  async run(input) {
    return compactCart(await addCartItem(input));
  },
  describe: (input, cart) => {
    const line = cart.lines.find((l) => l.variantId === input.variantId);
    return `Assistant added ${line?.product ?? 'an item'} to your cart`;
  },
});

export const getCart = defineTool({
  name: 'get_cart',
  description: "Read the visitor's current cart: lines, adjustments, estimated total.",
  inputSchema: z.object({}),
  readOnly: true,
  async run() {
    return compactCart(await fetchCart());
  },
});

export const updateCartLines = defineTool({
  name: 'update_cart_lines',
  description:
    'Change quantities of cart lines (use `itemId` from get_cart). Quantity 0 removes the line. ' +
    'Lines are applied in order; the first failure stops the rest.',
  inputSchema: z.object({
    lines: z
      .array(
        z.object({
          itemId: z.string().trim().min(1).max(64),
          quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY),
        }),
      )
      .min(1)
      .max(CART_LINES_MAX),
  }),
  readOnly: false,
  async run({ lines }) {
    let cart: WebCart | null = null;
    for (const line of lines) {
      cart =
        line.quantity === 0
          ? await removeCartItem(line.itemId)
          : await updateCartItem(line.itemId, { quantity: line.quantity });
    }
    return compactCart(cart ?? (await fetchCart()));
  },
  describe: (input) =>
    `Assistant changed ${input.lines.length} ${input.lines.length === 1 ? 'line' : 'lines'} in your cart`,
});

export const searchPoliciesAndFaqs = defineTool({
  name: 'search_shop_policies_and_faqs',
  description:
    'Search the help centre (shipping, returns, payments, accounts) for policy and FAQ answers.',
  inputSchema: z.object({
    query: z.string().trim().min(1).max(100),
    topic: HelpTopicSchema.optional(),
  }),
  readOnly: true,
  async run({ query, topic }) {
    const hits = await searchHelp({ q: query, topic });
    return {
      results: hits.slice(0, 8).map((h) => ({
        title: h.question,
        topic: h.topic,
        answer: truncate(h.answerMd, 1200),
        url: `/help?topic=${h.topic}&q=${encodeURIComponent(h.question)}`,
      })),
    };
  },
});

export const AGENT_TOOLS: readonly AgentTool[] = [
  searchCatalog,
  getProduct,
  addToCart,
  getCart,
  updateCartLines,
  searchPoliciesAndFaqs,
];
