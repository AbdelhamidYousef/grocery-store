// Display helpers for the integer units the API uses on the product page. Done on the number's
// own digits (no float division), so 26.5 % never shows up as 26.499999.

/** Basis points as a percentage without trailing zeros: 2650 -> "26.5", 2600 -> "26", 7 -> "0.07". */
export function bpToPercent(bp: number): string {
  const whole = Math.floor(bp / 100);
  const fraction = String(bp % 100)
    .padStart(2, '0')
    .replace(/0$/, '');
  return fraction === '' || fraction === '0' ? String(whole) : `${whole}.${fraction}`;
}

/** Grams as kilograms without trailing zeros: 7500 -> "7.5", 5000 -> "5", 250 -> "0.25". */
export function gramsToKg(grams: number): string {
  const whole = Math.floor(grams / 1000);
  const fraction = String(grams % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return fraction === '' ? String(whole) : `${whole}.${fraction}`;
}

/** Kilograms as a number in the shopper's locale, no unit: 7500 -> "7.5" (de: "7,5"). */
export function formatKgNumber(grams: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(grams / 1000);
}

/** Grams for people: 280 -> "280 g", 1500 -> "1.5 kg" (a decimal comma in de). */
export function formatGrams(grams: number, locale = 'en'): string {
  return grams >= 1000 ? `${formatKgNumber(grams, locale)} kg` : `${grams} g`;
}

const KG = /^\d{1,3}(?:[.,]\d{1,3})?$/;
/** "7.5" or "7,5" -> 7500 grams, done on the text; null for anything else. */
export function kgToGrams(raw: string): number | null {
  const text = raw.trim();
  if (!KG.test(text)) return null;
  const [whole = '0', fraction = ''] = text.replace(',', '.').split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}
