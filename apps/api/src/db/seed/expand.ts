import type { NetUnit, Nutrition } from '@store/shared';

import type { ProductAttributes } from '../schema/products.ts';

// Pure functions only (no database), so the shape of the catalogue can be unit-tested quickly.

export type OptionValue = {
  value: string;
  label: string;
  priceDeltaCents?: number;
  // Multiplies the product's base weight, e.g. a large size is heavier than a small one.
  weightFactor?: number;
  // What this value contains, in the product's base small unit (g or ml). Feeds the unit price.
  netAmount?: number;
  // A sample size: priced absolutely (not as a delta) and limited to one per customer.
  isTrial?: boolean;
  absolutePriceCents?: number;
};

export type OptionAxis = { key: string; values: OptionValue[] };

export type ProductSeed = {
  slug: string;
  name: string;
  nameDe: string;
  // The slug in capitals; the SKU is "GR-" plus it, followed by any option values.
  code: string;
  // The subcategory (leaf) the product sits in.
  categorySlug: string;
  // The top-level department (its slug is also the accent of the card and of the placeholder).
  department: string;
  description: string;
  descriptionDe: string;
  // One-sentence picture of the product; feeds alt text and the image brief.
  look: string;
  basePriceCents: number;
  baseWeightGrams: number;
  // Only where a product really comes in options (pack sizes); the catalogue has none yet.
  axes: OptionAxis[];
  // Shows a strike-through price on every variant.
  onSale?: boolean;
  // Slug from brands.ts; no brand (loose fruit and vegetables) when left out.
  brand?: string;
  // "Shop by need" tag slugs from tags.ts.
  tags?: string[];
  // Slugs of manual/seasonal collections the product belongs to (order = order in the file).
  collections?: string[];
  eco?: boolean;
  // Editorial "Bestseller" override (the badge is otherwise derived from sales).
  bestseller?: boolean;
  // Created within the last month, so the derived "New" badge shows on a few products.
  isNew?: boolean;
  // Net contents of the single pack, when it is a weight or volume (a count has none).
  netUnit?: NetUnit;
  net?: number;
  // Later phases read these three (weighing, best-before dates, bottle deposit); stored in
  // `attributes` for now, with no behaviour yet.
  soldByWeight: boolean;
  shelfLifeDays: number;
  deposit: boolean;
  storage?: NonNullable<ProductAttributes['storage']>;
  origin?: string;
  // Food information; null / empty for a product that is not food.
  nutrition: Nutrition | null;
  ingredients: string | null;
  allergens: string[];
  dietary: string[];
};

export type VariantSeed = {
  sku: string;
  name: string;
  options: Record<string, string>;
  priceCents: number;
  compareAtPriceCents: number | null;
  weightGrams: number;
  isDefault: boolean;
  netAmount: number | null;
  netUnit: NetUnit | null;
  isTrial: boolean;
  swatchHex: string | null;
};

// ---- Expansion ----

/** Cartesian product of the option axes, in axis order (first axis varies slowest). */
export function expandVariants(product: ProductSeed): VariantSeed[] {
  let combos: OptionValue[][] = [[]];
  for (const axis of product.axes) {
    combos = combos.flatMap((combo) => axis.values.map((value) => [...combo, value]));
  }

  return combos.map((combo, index) => {
    const trialValue = combo.find((v) => v.isTrial);
    const priceCents =
      trialValue?.absolutePriceCents ??
      product.basePriceCents + combo.reduce((sum, v) => sum + (v.priceDeltaCents ?? 0), 0);
    const factor = combo.reduce((acc, v) => acc * (v.weightFactor ?? 1), 1);
    const netAmount =
      combo.find((v) => v.netAmount !== undefined)?.netAmount ?? product.net ?? null;
    const options = Object.fromEntries(
      product.axes.map((axis, i) => [axis.key, combo[i]?.value ?? '']),
    );
    return {
      sku: ['GR', product.code, ...combo.map((v) => v.value.toUpperCase())].join('-'),
      name: combo.length === 0 ? 'Standard' : combo.map((v) => v.label).join(' · '),
      options,
      priceCents,
      // Integer math throughout: +25% rounded to the nearest 10 cents, no floating-point prices.
      // A sample is never "on sale": it is already the cheap way in.
      compareAtPriceCents:
        product.onSale && !trialValue ? Math.round((priceCents * 125) / 1000) * 10 : null,
      // A sample weighs its contents plus a little packaging.
      weightGrams: trialValue?.netAmount
        ? trialValue.netAmount + 10
        : Math.round(product.baseWeightGrams * factor),
      isDefault: index === 0,
      netAmount,
      netUnit: netAmount === null ? null : (product.netUnit ?? 'g'),
      isTrial: trialValue !== undefined,
      swatchHex: null,
    };
  });
}

export function imageRows(product: ProductSeed) {
  // One photo per product (a grocery shelf does not need a detail shot).
  return [
    {
      n: 1,
      url: `/products/${product.categorySlug}/${product.slug}-1.webp`,
      alt: product.look,
      width: 1200,
      height: 1200,
      sortOrder: 0,
    },
  ];
}

/**
 * Stock that is fixed on purpose, whatever the random sequence says. The sequence is index-based, so
 * adding a product anywhere moves every later variant's stock; the e2e suite and demos need one
 * sold-out product and one low-stock variant to stay put.
 */
export const FORCED_STOCK: Readonly<Record<string, number>> = {
  'GR-FROZEN-PRAWNS': 0, // the whole product is sold out
  'GR-MATJES-HERRING': 3, // low stock (below the default alert of 5)
};

/** Small seeded PRNG (mulberry32): "random" stock that is identical on every run. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stock 0-120 for every variant, in order. A few are forced to zero (sold-out UI) and a few to
 * 1-4 (below the default low-stock threshold of 5, for the admin badge).
 */
export function stockLevels(count: number, storeIndex = 0): number[] {
  // Each store gets its own deterministic spread (store 0, Mitte, is the one that has always been
  // seeded), so the same yoghurt is sold out in one store and plentiful in another.
  const random = seededRandom(20261031 + storeIndex * 7919);
  const shift = storeIndex * 11;
  return Array.from({ length: count }, (_, i) => {
    const base = Math.floor(random() * 121);
    const low = 1 + Math.floor(random() * 4);
    if ((i + shift) % 31 === 30) return 0;
    if ((i + shift) % 37 === 7) return low;
    return base;
  });
}

/**
 * Per-store overrides on top of `FORCED_STOCK` (which is Mitte's): the sold-out prawns are in stock
 * in the two southern stores, so "out of stock at your store" has something to contrast with.
 */
export const FORCED_STORE_STOCK: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'GR-FROZEN-PRAWNS': {
    mitte: 0,
    'prenzlauer-berg': 0,
    'kreuzberg-friedrichshain': 6,
    neukoelln: 12,
  },
};
