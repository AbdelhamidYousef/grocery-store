import { z } from 'zod';

// Store views: one storefront per language/currency, configured here and never forked in code.
// (A "store view" is this; a physical shop is phase 23's `stores`.) The URL prefix is the code
// (`/de-de/...`), so everything else (language, currency, shipping countries, VAT label) is a
// lookup from the code. Later slices read the same table: UI strings by `lang`, catalogue
// translations by `locale`, prices by `currency`.

const EU_SHIP = [
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
] as const;

export const STORE_CODES = ['eu-en', 'de-de', 'fr-fr', 'uk-en'] as const;
export type StoreCode = (typeof STORE_CODES)[number];

export interface StoreView {
  code: StoreCode;
  /** BCP 47 tag for Intl (numbers, dates, plurals). */
  locale: string;
  /** Language only: the key into the UI dictionaries and the `<html lang>` fallback chain. */
  lang: 'en' | 'de' | 'fr';
  /** Name shown in the switcher, in its own language so a shopper can find theirs. */
  label: string;
  currency: 'EUR' | 'GBP';
  /** ISO 3166-1 alpha-2 codes this store view ships to. */
  shipCountries: readonly string[];
  /** Every view shows prices including VAT (the demo charges no tax; see the decisions log). */
  taxDisplay: 'incl' | 'excl';
}

export const STORES: readonly StoreView[] = [
  {
    code: 'eu-en',
    locale: 'en-IE',
    lang: 'en',
    label: 'Europe (English)',
    currency: 'EUR',
    shipCountries: EU_SHIP,
    taxDisplay: 'incl',
  },
  {
    code: 'de-de',
    locale: 'de-DE',
    lang: 'de',
    label: 'Deutschland (Deutsch)',
    currency: 'EUR',
    shipCountries: ['DE', 'AT'],
    taxDisplay: 'incl',
  },
  {
    code: 'fr-fr',
    locale: 'fr-FR',
    lang: 'fr',
    label: 'France (Français)',
    currency: 'EUR',
    shipCountries: ['FR', 'BE', 'LU'],
    taxDisplay: 'incl',
  },
  {
    code: 'uk-en',
    locale: 'en-GB',
    lang: 'en',
    label: 'United Kingdom (English)',
    currency: 'GBP',
    shipCountries: ['GB'],
    taxDisplay: 'incl',
  },
];

export const DEFAULT_STORE: StoreView = STORES[0] as StoreView;

export const storeCodeSchema = z.enum(STORE_CODES);

export function isStoreCode(value: unknown): value is StoreCode {
  return storeCodeSchema.safeParse(value).success;
}

export function storeFromCode(code: string | null | undefined): StoreView | undefined {
  return STORES.find((store) => store.code === code);
}

/**
 * Picks a store from a browser language list (`navigator.languages`): the first language with a
 * store whose language matches (region first, then language only). Falls back to the default.
 */
export function storeFromLanguages(languages: readonly string[]): StoreView {
  for (const tag of languages) {
    const lower = tag.toLowerCase();
    const exact = STORES.find((store) => store.locale.toLowerCase() === lower);
    if (exact) return exact;
    const lang = lower.split('-')[0];
    // `en` alone stays on the default store: English speakers are not all in the UK.
    const byLang = STORES.find((store) => store.lang === lang && store.code !== 'uk-en');
    if (byLang) return byLang;
  }
  return DEFAULT_STORE;
}
