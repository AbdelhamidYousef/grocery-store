import type { ProductAttributes } from '../schema/products.ts';

// Pure functions only (no database), so the shape of the catalog can be unit-tested quickly.

export type Pet = NonNullable<ProductAttributes['pet']>;

export type OptionValue = {
  value: string;
  label: string;
  priceDeltaCents?: number;
  // Multiplies the product's base weight, e.g. a large size is heavier than a small one.
  weightFactor?: number;
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
};

export type VariantSeed = {
  sku: string;
  name: string;
  options: Record<string, string>;
  priceCents: number;
  compareAtPriceCents: number | null;
  weightGrams: number;
  isDefault: boolean;
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Option axis builders, so product data stays short and readable ----

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

// Two pack sizes: the bigger one costs `extraCents` more and weighs `weightFactor` times as much.
export const packs = (
  small: { value: string; label: string },
  large: { value: string; label: string },
  extraCents: number,
  weightFactor: number,
): OptionAxis => ({
  key: 'pack',
  values: [
    { ...small, priceDeltaCents: 0, weightFactor: 1 },
    { ...large, priceDeltaCents: extraCents, weightFactor },
  ],
});

// ---- Expansion ----

const PET_SKU: Record<Pet, string> = {
  dog: 'DOG',
  cat: 'CAT',
  bird: 'BIRD',
  fish: 'FISH',
  small: 'SMALL',
};

/** Cartesian product of the option axes, in axis order (first axis varies slowest). */
export function expandVariants(product: ProductSeed): VariantSeed[] {
  let combos: OptionValue[][] = [[]];
  for (const axis of product.axes) {
    combos = combos.flatMap((combo) => axis.values.map((value) => [...combo, value]));
  }

  return combos.map((combo, index) => {
    const priceCents =
      product.basePriceCents + combo.reduce((sum, v) => sum + (v.priceDeltaCents ?? 0), 0);
    const factor = combo.reduce((acc, v) => acc * (v.weightFactor ?? 1), 1);
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
      compareAtPriceCents: product.onSale ? Math.round((priceCents * 125) / 1000) * 10 : null,
      weightGrams: Math.round(product.baseWeightGrams * factor),
      isDefault: index === 0,
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
