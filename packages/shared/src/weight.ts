// Items sold by weight (loose fruit, counter cheese, fish): the shopper buys "about 500 g", the card
// is authorised for an estimate plus a buffer, and the real weight is charged after packing. All
// amounts are integer cents; the one rounding rule lives here and nowhere else.

/** The buffer added to the weighed part of an order when the card is authorised. */
export const WEIGHT_BUFFER_PERCENT = 15;

/**
 * The price of `grams` at `pricePerKgCents`, in whole cents: `round(pricePerKg * grams / 1000)`,
 * half up, rounded ONCE for the whole line (never per gram, never per unit).
 */
export function weighedCents(pricePerKgCents: number, grams: number): number {
  return Math.floor((pricePerKgCents * grams + 500) / 1000);
}

/** The estimate of one "about 500 g" unit: what the cart shows before anything is weighed. */
export function estimateCents(pricePerKgCents: number, nominalGrams: number): number {
  return weighedCents(pricePerKgCents, nominalGrams);
}

/** The price per kilogram a unit price implies (for seeding: 189 cents for 500 g is 378 per kg). */
export function pricePerKgFor(unitCents: number, nominalGrams: number): number {
  return Math.round((unitCents * 1000) / nominalGrams);
}

/** The 15 % on top of the weighed lines' estimate, rounded once half up. */
export function weightBufferCents(weighedLinesCents: number): number {
  return Math.floor((weighedLinesCents * WEIGHT_BUFFER_PERCENT + 50) / 100);
}

/**
 * What the card is authorised for: the order total (weighed lines at their estimate) plus the
 * buffer on the weighed lines. An order with nothing weighed is authorised for exactly its total.
 * The capture can be lower than this, never higher.
 */
export function authorisationCents(
  totalCents: number,
  weighedLineCents: readonly number[],
): number {
  const weighed = weighedLineCents.reduce((sum, cents) => sum + cents, 0);
  return totalCents + weightBufferCents(weighed);
}

/** "500 g" or "1.2 kg" for a nominal weight; one decimal at most, no trailing zero. */
export function formatGrams(grams: number, locale: string): string {
  if (grams < 1000) return `${new Intl.NumberFormat(locale).format(grams)} g`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(grams / 1000)} kg`;
}
