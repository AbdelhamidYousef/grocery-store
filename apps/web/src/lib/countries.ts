// Countries offered in the address form. The API accepts any ISO 3166-1 alpha-2 code today (the
// checkout phase narrows it to the countries we ship to), so this list is a convenience, not a
// rule. Names come from the browser's own region names, so they are translated for free.
export const COUNTRY_CODES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'NO',
  'CH',
  'GB',
  'US',
  'CA',
] as const;

export function countryName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

// The offered countries, plus `extra` when an existing address uses one that is not in the list.
export function countryOptions(extra?: string): { code: string; name: string }[] {
  const codes: string[] = [...COUNTRY_CODES];
  if (extra && !codes.includes(extra)) codes.push(extra);
  return codes
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
