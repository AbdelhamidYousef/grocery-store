import type { Variant } from '@store/shared';

// Pure functions that turn the API's flat variant list into picker behaviour. Nothing here knows
// about "colour" or "size": the option axes come from the data (`optionKeys`), so a product with
// `flavour` and `pack` works the same as one with `color` and `size`.

/** The variant shown first: the one flagged default, else the first purchasable, else the first. */
export function defaultVariant(variants: readonly Variant[]): Variant | undefined {
  return variants.find((v) => v.isDefault) ?? variants.find((v) => v.available) ?? variants[0];
}

/** One chosen value per option key, e.g. `{ color: 'red', size: 'S' }`. */
export type Selection = Record<string, string>;

export function selectionOf(variant: Variant, optionKeys: readonly string[]): Selection {
  return Object.fromEntries(optionKeys.map((k) => [k, variant.options[k] ?? '']));
}

// Sizes small to large; a pack choice lists the full size before its free sample.
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const PACK_ORDER = ['full', 'trial'];

/** The distinct values an option key takes, in the order the data lists them (sizes sorted). */
export function optionValues(variants: readonly Variant[], key: string): string[] {
  const values = [...new Set(variants.flatMap((v) => (v.options[key] ? [v.options[key]] : [])))];
  const order = key === 'pack' ? PACK_ORDER : SIZE_ORDER;
  return values.every((v) => order.includes(v))
    ? [...values].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    : values;
}

/** The variant matching every chosen option, or undefined when that combination does not exist. */
export function findVariant(
  variants: readonly Variant[],
  selection: Selection,
): Variant | undefined {
  return variants.find((v) => Object.entries(selection).every(([k, val]) => v.options[k] === val));
}

export type OptionStatus = 'available' | 'sold-out' | 'unavailable';

/**
 * What would happen if the shopper picked `value` for `key` while keeping their other choices:
 * `unavailable` (no such combination exists), `sold-out`, or `available`.
 */
export function optionStatus(
  variants: readonly Variant[],
  selection: Selection,
  key: string,
  value: string,
): OptionStatus {
  const candidate = findVariant(variants, { ...selection, [key]: value });
  if (!candidate) return 'unavailable';
  return candidate.available ? 'available' : 'sold-out';
}

/** Resolves `?variant=<sku>`; an unknown sku (old link, typo) falls back to the default. */
export function variantFromSku(
  variants: readonly Variant[],
  sku: string | null,
): Variant | undefined {
  return (sku ? variants.find((v) => v.sku === sku) : undefined) ?? defaultVariant(variants);
}
