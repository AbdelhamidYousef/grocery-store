import type { Variant } from '@store/shared';

// Pure functions that turn the API's flat variant list into picker behaviour. Nothing here knows
// about "colour" or "size": the option axes come from the data (`optionKeys`), so a product with
// `flavour` and `pack` works the same as one with `color` and `size`.

/** The variant shown first: the one flagged default, else the first purchasable, else the first. */
export function defaultVariant(variants: readonly Variant[]): Variant | undefined {
  return variants.find((v) => v.isDefault) ?? variants.find((v) => v.available) ?? variants[0];
}
