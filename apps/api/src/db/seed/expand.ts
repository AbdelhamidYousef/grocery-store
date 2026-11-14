import type { NetUnit, Pet } from '@store/shared';

import type { ProductAttributes } from '../schema/products.ts';

// Pure functions only (no database), so the shape of the catalog can be unit-tested quickly.

export type { Pet };

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
  // Short uppercase code used inside SKUs: PW-DOG-ROPE-RED-L.
  code: string;
  categorySlug: string;
  pet: Pet;
  material: string;
  ageStage: NonNullable<ProductAttributes['ageStage']>;
  description: string;
  // One-sentence picture of the default colour variant; feeds alt text and the image brief.
  look: string;
  basePriceCents: number;
  baseWeightGrams: number;
  axes: OptionAxis[];
  // Shows a strike-through price on every variant.
  onSale?: boolean;
  // Slug from brands.ts; the house brand when left out.
  brand?: string;
  // Health-need tag slugs from tags.ts.
  tags?: string[];
  // Slugs of manual/seasonal collections the product belongs to (order = order in the file).
  collections?: string[];
  eco?: boolean;
  // Demo gate (phase 22): the order waits for a simulated vet's approval after payment.
  vetApproval?: boolean;
  // Editorial "Bestseller" override (the badge is otherwise derived from sales).
  bestseller?: boolean;
  // Created within the last month, so the derived "New" badge shows on a few products.
  isNew?: boolean;
  // Unit of the net amounts on the option values; grams unless the product is a liquid.
  netUnit?: NetUnit;
  // Net contents for a product with no pack axis (a 100 g bag sold in one size).
  net?: number;
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

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Option axis builders, so product data stays short and readable ----

// Swatch dots on the product card. A colour without an entry here fails the seed test, so a new
// colour name cannot ship without a visible dot.
export const COLOR_HEX: Record<string, string> = {
  orange: '#F97316',
  blue: '#3B82F6',
  green: '#22C55E',
  grey: '#9CA3AF',
  cream: '#FEF3C7',
  yellow: '#FACC15',
  pink: '#F472B6',
  teal: '#14B8A6',
  sand: '#D6C3A1',
  slate: '#64748B',
  sage: '#9CAF88',
  red: '#EF4444',
  purple: '#8B5CF6',
  black: '#1F2937',
  white: '#F9FAFB',
  brown: '#92400E',
  navy: '#1E3A8A',
  mint: '#6EE7B7',
  coral: '#FB7185',
  lavender: '#C4B5FD',
  terracotta: '#C2623F',
  olive: '#7C8B3A',
  blush: '#FBCFE8',
  clear: '#E0F2FE',
  lilac: '#D8B4FE',
  lime: '#A3E635',
  mustard: '#CA8A04',
  natural: '#E7D9B8',
  plum: '#7E22CE',
  sky: '#7DD3FC',
};

export const colors = (values: string[]): OptionAxis => ({
  key: 'color',
  values: values.map((v) => ({ value: v, label: titleCase(v) })),
});

const SIZE_LABELS = { S: 'Small', M: 'Medium', L: 'Large' } as const;
const SIZE_WEIGHT = { S: 1, M: 1.5, L: 2.2 } as const;

// `step` is the extra price per size step: M costs +step, L costs +2 * step.
export const sizes = (step: number, which: ('S' | 'M' | 'L')[] = ['S', 'M', 'L']): OptionAxis => ({
  key: 'size',
  values: which.map((s) => ({
    value: s,
    label: SIZE_LABELS[s],
    priceDeltaCents: step * (s === 'S' ? 0 : s === 'M' ? 1 : 2),
    weightFactor: SIZE_WEIGHT[s],
  })),
});

export const choice = (key: string, values: string[]): OptionAxis => ({
  key,
  values: values.map((v) => ({ value: v, label: titleCase(v) })),
});

// Net grams from a pack value such as "150g" or "2kg"; null when the value is a count ("4x").
function netFromValue(value: string): number | undefined {
  const m = /^(\d+)(g|kg)$/.exec(value);
  return m ? Number(m[1]) * (m[2] === 'kg' ? 1000 : 1) : undefined;
}

// Two pack sizes: the bigger one costs `extraCents` more and weighs `weightFactor` times as much.
// Net amounts come from the value ("150g") unless `nets` gives them (counted packs). `trial` adds
// a third, sample-sized value at an absolute price.
export const packs = (
  small: { value: string; label: string },
  large: { value: string; label: string },
  extraCents: number,
  weightFactor: number,
  opts: {
    nets?: [number, number];
    trial?: { amount: number; priceCents: number };
  } = {},
): OptionAxis => {
  const smallNet = opts.nets?.[0] ?? netFromValue(small.value);
  const largeNet = opts.nets?.[1] ?? netFromValue(large.value);
  const values: OptionValue[] = [
    { ...small, priceDeltaCents: 0, weightFactor: 1, ...(smallNet && { netAmount: smallNet }) },
    {
      ...large,
      priceDeltaCents: extraCents,
      weightFactor,
      ...(largeNet && { netAmount: largeNet }),
    },
  ];
  if (opts.trial) {
    values.push({
      value: 'trial',
      label: `${opts.trial.amount} g sample`,
      isTrial: true,
      absolutePriceCents: opts.trial.priceCents,
      netAmount: opts.trial.amount,
    });
  }
  return { key: 'pack', values };
};

// ---- Expansion ----

const PET_SKU: Record<Pet, string> = {
  dog: 'DOG',
  cat: 'CAT',
  bird: 'BIRD',
  fish: 'FISH',
  small: 'SMALL',
  reptile: 'REPT',
};

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
    const colour = product.axes.findIndex((a) => a.key === 'color');
    const colourName = colour >= 0 ? combo[colour]?.value : undefined;
    const options = Object.fromEntries(
      product.axes.map((axis, i) => [axis.key, combo[i]?.value ?? '']),
    );
    return {
      sku: [
        'PW',
        PET_SKU[product.pet],
        product.code,
        ...combo.map((v) => v.value.toUpperCase()),
      ].join('-'),
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
      swatchHex: colourName ? (COLOR_HEX[colourName] ?? null) : null,
    };
  });
}

export function imageRows(product: ProductSeed) {
  // Products with many variants get a second "detail" image; simple ones get one.
  const count = expandVariants(product).length >= 6 ? 2 : 1;
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      n,
      url: `/products/${product.categorySlug}/${product.slug}-${n}.webp`,
      alt:
        n === 1 ? product.look : `Close-up of the ${product.name} showing its ${product.material}`,
      width: 1200,
      height: 1200,
      sortOrder: i,
    };
  });
}

/**
 * Stock that is fixed on purpose, whatever the random sequence says. The sequence is index-based, so
 * adding a product anywhere moves every later variant's stock; the e2e suite and demos need one
 * sold-out product and one low-stock variant to stay put.
 */
export const FORCED_STOCK: Readonly<Record<string, number>> = {
  'PW-FISH-LED': 0, // the whole product is sold out
  'PW-BIRD-BELL-GREEN': 3, // low stock (below the default alert of 5)
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
export function stockLevels(count: number): number[] {
  const random = seededRandom(20261031);
  return Array.from({ length: count }, (_, i) => {
    const base = Math.floor(random() * 121);
    const low = 1 + Math.floor(random() * 4);
    if (i % 31 === 30) return 0;
    if (i % 37 === 7) return low;
    return base;
  });
}
