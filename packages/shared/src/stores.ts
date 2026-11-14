import { z } from 'zod';

// Store views: one storefront per language/currency, configured here and never forked in code.
// (A "store view" is this; a physical shop is phase 23's `stores`.) The URL prefix is the code
// (`/de-de/...`), so everything else (language, currency, shipping countries, VAT label) is a
// lookup from the code. Later slices read the same table: UI strings by `lang`, catalogue
// translations by `locale`, prices by `currency`.

export const STORE_CODES = ['de-en', 'de-de'] as const;
export type StoreCode = (typeof STORE_CODES)[number];

export interface StoreView {
  code: StoreCode;
  /** BCP 47 tag for Intl (numbers, dates, plurals). */
  locale: string;
  /** Language only: the key into the UI dictionaries and the `<html lang>` fallback chain. */
  lang: 'en' | 'de';
  /** Name shown in the switcher, in its own language so a shopper can find theirs. */
  label: string;
  currency: 'EUR';
  /** ISO 3166-1 alpha-2 codes this store view ships to. */
  shipCountries: readonly string[];
  /** Every view shows prices including VAT (the demo charges no tax; see the decisions log). */
  taxDisplay: 'incl' | 'excl';
}

export const STORES: readonly StoreView[] = [
  {
    code: 'de-en',
    locale: 'en-DE',
    lang: 'en',
    label: 'English',
    currency: 'EUR',
    shipCountries: ['DE'],
    taxDisplay: 'incl',
  },
  {
    code: 'de-de',
    locale: 'de-DE',
    lang: 'de',
    label: 'Deutsch',
    currency: 'EUR',
    shipCountries: ['DE'],
    taxDisplay: 'incl',
  },
];

/** Prefixes of the old multi-country shop (Pawsome): they land on the English view. */
export const LEGACY_STORE_CODES = ['eu-en', 'uk-en', 'fr-fr'] as const;

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
    const byLang = STORES.find((store) => store.lang === lang);
    if (byLang) return byLang;
  }
  return DEFAULT_STORE;
}
