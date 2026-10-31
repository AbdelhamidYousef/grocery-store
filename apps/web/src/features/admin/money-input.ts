// Prices are typed as text ("12.99") and stored as integer cents. The conversion is done on the
// string, never with `Number(x) * 100`: 19.99 * 100 is 1998.9999999999998 in floating point, and
// the project rule is that money never touches a float.

const AMOUNT = /^\d{1,7}(?:[.,]\d{1,2})?$/;

/** "12", "12.5", "12,50" -> cents; anything else (negative, 3 decimals, text) -> null. */
export function inputToCents(raw: string): number | null {
  const text = raw.trim();
  if (!AMOUNT.test(text)) return null;
  const [whole = '0', fraction = ''] = text.replace(',', '.').split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** 1250 -> "12.50": what an input shows for an existing price. */
export function centsToInput(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** A non-negative whole number typed as text; null when it is anything else. */
export function inputToInt(raw: string): number | null {
  const text = raw.trim();
  return /^\d{1,9}$/.test(text) ? Number(text) : null;
}
