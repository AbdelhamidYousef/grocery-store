import { addDays } from './slots.ts';

// Best-before rules shared by the API (which packs to take) and the web (what to show). Dates are
// calendar days in the shop's zone ("YYYY-MM-DD"), never instants: a best-before date has no time.

/** A batch is "short-dated" on its best-before day and the days before it, up to this many. */
export const SHORT_DATE_DAYS = 2;

export type BatchClass = 'expired' | 'short' | 'regular';

/** Whole days from `today` to `bestBefore` (negative once it has passed). */
export function daysUntil(bestBefore: string, today: string): number {
  const at = (key: string) => {
    const [y = 0, m = 0, d = 0] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(bestBefore) - at(today)) / 86_400_000);
}

/**
 * Expired once the day after its date has begun (a pack is good on its best-before day); short-dated
 * when at most `SHORT_DATE_DAYS` days are left; a null date never expires.
 */
export function batchClass(bestBefore: string | null, today: string): BatchClass {
  if (bestBefore === null) return 'regular';
  const left = daysUntil(bestBefore, today);
  if (left < 0) return 'expired';
  return left <= SHORT_DATE_DAYS ? 'short' : 'regular';
}

/** The best-before date of a fresh delivery received `today`; null for a product that does not expire. */
export function freshBestBefore(today: string, shelfLifeDays: number | null): string | null {
  return shelfLifeDays === null ? null : addDays(today, shelfLifeDays);
}

/** Sorts best-before dates oldest first, "does not expire" (null) last. */
export function compareBestBefore(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Short-dated packs are sold this many percent below the normal price. */
export const SHORT_DATED_PERCENT_OFF = 30;

/**
 * The price of one short-dated pack: `unitCents` minus 30 %, in whole cents. The reduction is
 * rounded once (half up) and subtracted, so price + reduction is always exactly the normal price.
 */
export function shortDatedPrice(unitCents: number): number {
  const off = Math.floor((unitCents * SHORT_DATED_PERCENT_OFF + 50) / 100);
  return unitCents - off;
}
