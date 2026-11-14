import {
  DEFAULT_STORE,
  formatMoney,
  interpolate,
  pickPlural,
  storeFromCode,
  type StoreView,
  type TextEntry,
  type TextParams,
} from '@store/shared';

import { de } from './de.ts';
import { en, type EmailKey } from './en.ts';
import { fr } from './fr.ts';

export type { EmailKey } from './en.ts';
export type EmailLang = 'en' | 'de' | 'fr';

const DICTIONARIES: Record<EmailLang, Record<EmailKey, TextEntry>> = { en, de, fr };

type PluralKey = { [K in EmailKey]: (typeof en)[K] extends string ? never : K }[EmailKey];
type PlainKey = Exclude<EmailKey, PluralKey>;

// What a template needs to speak one language: the strings, the locale for numbers and dates, and
// the store view's URL prefix so links land in the same language the email is in.
export interface EmailText {
  lang: EmailLang;
  locale: string;
  storeCode: string;
  /** Between a label and its value: `: ` (French puts a non-breaking space before the colon). */
  colon: string;
  /** Plain string; a key missing in the language falls back to English (and so never shows a key). */
  t: (key: PlainKey, params?: TextParams) => string;
  /** Plural string for `count` (`{count}` is filled in too). */
  tn: (key: PluralKey, count: number, params?: TextParams) => string;
  money: (cents: number, currency: string) => string;
  date: (iso: string) => string;
  /** `<web origin>/<store>/<path>`: a link into the store view the email was written for. */
  url: (origin: string, path: string) => string;
}

// The language of a store view code (`de-de` gives German); an unknown or missing code is English.
export function storeFor(storeView: string | null | undefined): StoreView {
  return storeFromCode(storeView) ?? DEFAULT_STORE;
}

export function emailText(storeView?: string | null): EmailText {
  const store = storeFor(storeView);
  const lang: EmailLang = store.lang;
  const find = (key: EmailKey): TextEntry => DICTIONARIES[lang][key] ?? en[key];
  return {
    lang,
    locale: store.locale,
    storeCode: store.code,
    colon: lang === 'fr' ? '\u00a0: ' : ': ',
    t: (key, params) => {
      const entry = find(key);
      return interpolate(typeof entry === 'string' ? entry : entry.other, params);
    },
    tn: (key, count, params) => {
      const entry = find(key);
      const template = typeof entry === 'string' ? entry : pickPlural(entry, count, store.locale);
      return interpolate(template, { count, ...params });
    },
    money: (cents, currency) => formatMoney(cents, currency, store.locale),
    date: (iso) =>
      new Intl.DateTimeFormat(store.locale, {
        dateStyle: 'long',
        timeStyle: 'long',
        timeZone: 'UTC',
      }).format(new Date(iso)),
    url: (origin, path) => `${origin.replace(/\/$/, '')}/${store.code}${path}`,
  };
}
