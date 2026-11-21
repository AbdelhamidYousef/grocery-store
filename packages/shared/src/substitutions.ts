import { z } from 'zod';

// Substitutions (G7): what the shop does when something is missing at packing time. The rule an
// interviewer will ask about lives here, pure and tested: a candidate is SAFE before it is similar.

export const SUBSTITUTION_PREFERENCES = ['best_match', 'specific', 'none'] as const;
export const SubstitutionPreferenceSchema = z.enum(SUBSTITUTION_PREFERENCES);
export type SubstitutionPreference = z.infer<typeof SubstitutionPreferenceSchema>;
export const DEFAULT_SUBSTITUTION: SubstitutionPreference = 'best_match';

/** How far a substitute's price may be from the original's, in percent either way. */
export const SUBSTITUTE_PRICE_BAND_PERCENT = 30;
/** How many candidates the shopper may choose from for a "specific" substitute. */
export const SUBSTITUTE_LIST_SIZE = 5;

/** What the matching rules need to know about one sellable variant. */
export interface SubstitutionProduct {
  variantId: string;
  productId: string;
  /** The (sub)category the product sits in: only the same one is similar. */
  categoryId: string;
  /** Unit price in cents (the estimate of one unit for a weighed item). */
  priceCents: number;
  /** Declared allergen slugs. */
  allergens: readonly string[];
  /** Dietary tag slugs (vegan, gluten-free, ...). */
  dietary: readonly string[];
  /** Food carries allergen and dietary rules; a sponge does not. */
  isFood: boolean;
  /** Units that can be sold right now at the order's store (stock minus reserved). */
  available: number;
}

/** Integer check, no floats: |candidate - original| <= 30 % of the original. */
export function withinPriceBand(originalCents: number, candidateCents: number): boolean {
  return (
    Math.abs(candidateCents - originalCents) * 100 <= originalCents * SUBSTITUTE_PRICE_BAND_PERCENT
  );
}

/**
 * Is `candidate` safe to put in place of `original`? Never adds an allergen the original did not
 * declare, always keeps every dietary tag the original had. A non-food original has no such rules.
 */
export function isSafeSubstitute(
  original: SubstitutionProduct,
  candidate: SubstitutionProduct,
): boolean {
  if (!original.isFood) return true;
  const allowed = new Set(original.allergens);
  if (candidate.allergens.some((a) => !allowed.has(a))) return false;
  const has = new Set(candidate.dietary);
  return original.dietary.every((d) => has.has(d));
}

/**
 * The best replacements for `original`, safest first by construction: the candidate must be a
 * different variant, safe (see `isSafeSubstitute`), in the same subcategory, priced within +-30 %
 * and in stock. The survivors are ranked by closeness of price (then the cheaper one, then id, so
 * the order is stable) and cut to `limit`.
 */
export function bestMatches(
  original: SubstitutionProduct,
  candidates: readonly SubstitutionProduct[],
  limit: number = SUBSTITUTE_LIST_SIZE,
): SubstitutionProduct[] {
  return candidates
    .filter(
      (c) =>
        c.variantId !== original.variantId &&
        c.categoryId === original.categoryId &&
        c.available > 0 &&
        withinPriceBand(original.priceCents, c.priceCents) &&
        isSafeSubstitute(original, c),
    )
    .sort(
      (a, b) =>
        Math.abs(a.priceCents - original.priceCents) -
          Math.abs(b.priceCents - original.priceCents) ||
        a.priceCents - b.priceCents ||
        a.variantId.localeCompare(b.variantId),
    )
    .slice(0, Math.max(0, limit));
}

/** What a substitute costs per unit: never more than the original it replaces. */
export function swapUnitCents(originalUnitCents: number, substituteUnitCents: number): number {
  return Math.min(originalUnitCents, substituteUnitCents);
}

/**
 * The charge for a weighed substitute once packed: the weighed price, but never above what the
 * shopper agreed to pay for the original units (`originalUnitCents x quantity`).
 */
export function cappedSwapCents(
  originalUnitCents: number,
  quantity: number,
  cents: number,
): number {
  return Math.min(cents, originalUnitCents * quantity);
}

export const SWAP_STATUSES = ['proposed', 'accepted', 'rejected'] as const;
export const SwapStatusSchema = z.enum(SWAP_STATUSES);
export type SwapStatus = z.infer<typeof SwapStatusSchema>;

export const PICK_STATUSES = ['pending', 'picked', 'short', 'missing', 'substituted'] as const;
export const PickStatusSchema = z.enum(PICK_STATUSES);
export type PickStatus = z.infer<typeof PickStatusSchema>;
