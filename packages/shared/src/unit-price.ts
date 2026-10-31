import type { NetUnit } from './pets.ts';

export type UnitPrice = { cents: number; per: 'kg' | 'L' };

/**
 * Price per kilogram or per litre, in integer cents.
 *
 * Net amounts are stored as integers in the base small unit (grams or millilitres), so
 *   unit = round_half_up(priceCents * 1000 / netAmount).
 * Rounding rule, shown in the UI footnote: "rounded to the nearest cent", halves go up. It is done
 * with integers only: round_half_up(a / b) = floor((2a + b) / (2b)), so there is no float to
 * misround (0.1 + 0.2 style errors).
 *
 * Returns null when there is no usable net amount (a toy has no weight worth comparing).
 */
export function unitPriceCents(
  priceCents: number,
  netAmount: number | null | undefined,
  netUnit: NetUnit | null | undefined,
): UnitPrice | null {
  if (netAmount == null || netUnit == null) return null;
  if (!Number.isInteger(netAmount) || netAmount <= 0) return null;
  if (!Number.isInteger(priceCents) || priceCents < 0) return null;
  const scaled = priceCents * 1000;
  const cents = Math.floor((2 * scaled + netAmount) / (2 * netAmount));
  return { cents, per: netUnit === 'g' ? 'kg' : 'L' };
}
