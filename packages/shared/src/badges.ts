// Badges are derived from facts we already hold, so they can never drift from the data. Only the
// genuinely editorial flags (`isEco`, the bestseller override, `badgeNewUntil`) are stored.

export const BADGES = ['Bestseller', 'New', 'Sale', 'Eco', 'Low stock'] as const;
export type Badge = (typeof BADGES)[number];

export const NEW_BADGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BadgeVariant = {
  priceCents: number;
  compareAtPriceCents: number | null;
  isDefault: boolean;
  /** quantity - reserved. Used only to decide a badge; never shown. */
  availableUnits: number;
  lowStockThreshold: number;
};

export type BadgeInput = {
  createdAt: Date;
  badgeNewUntil: Date | null;
  isEco: boolean;
  /** The manual override OR membership of the sales-based top group (see `bestsellerIds`). */
  isBestseller: boolean;
  variants: BadgeVariant[];
};

/** Badges in a fixed display order. `now` is a parameter so tests can pin the clock. */
export function deriveBadges(product: BadgeInput, now: Date): Badge[] {
  const out: Badge[] = [];
  if (product.isBestseller) out.push('Bestseller');

  const age = now.getTime() - product.createdAt.getTime();
  const isNewByAge = age >= 0 && age < NEW_BADGE_DAYS * DAY_MS;
  const isNewByDate =
    product.badgeNewUntil !== null && now.getTime() < product.badgeNewUntil.getTime();
  if (isNewByAge || isNewByDate) out.push('New');

  if (
    product.variants.some(
      (v) => v.compareAtPriceCents !== null && v.compareAtPriceCents > v.priceCents,
    )
  )
    out.push('Sale');
  if (product.isEco) out.push('Eco');

  // The default variant is the one the card shows, so that is the one whose stock matters.
  const def = product.variants.find((v) => v.isDefault);
  if (def && def.availableUnits > 0 && def.availableUnits <= def.lowStockThreshold)
    out.push('Low stock');
  return out;
}

export const BESTSELLER_SHARE_PERCENT = 10;

/**
 * Ids in the top 10% of the catalogue by units sold (the caller passes units from paid-or-later
 * orders in the last 90 days). The group size is ceil(10% of the catalogue), products with no
 * sales never qualify, and ties at the cut-off are all included so the result does not depend on
 * row order.
 */
export function bestsellerIds(unitsByProduct: ReadonlyMap<string, number>, catalogueSize: number) {
  const sold = [...unitsByProduct].filter(([, units]) => units > 0).sort((a, b) => b[1] - a[1]);
  const groupSize = Math.ceil((catalogueSize * BESTSELLER_SHARE_PERCENT) / 100);
  if (groupSize === 0 || sold.length === 0) return new Set<string>();
  const cutoff = sold[Math.min(groupSize, sold.length) - 1]?.[1] ?? Infinity;
  return new Set(sold.filter(([, units]) => units >= cutoff).map(([id]) => id));
}
