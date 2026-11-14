import { useMemo } from 'react';

import { useStore } from '../features/stores/StoreContext';

import { de } from './de';
import { en } from './en';
import { makeLookup } from './translate';
import type { Dictionary, Params, PluralForms } from './types';

export type { Dictionary, Entry, Params, PluralForms } from './types';
export { en };

export type Key = keyof typeof en;
// `t` takes keys whose entry is a string, `tn` the ones with plural forms: the compiler stops a
// plural key being used as plain text (or the other way round).
export type StringKey = { [K in Key]: (typeof en)[K] extends string ? K : never }[Key];
export type PluralKey = { [K in Key]: (typeof en)[K] extends PluralForms ? K : never }[Key];

export type TFunction = (key: StringKey, params?: Params) => string;
export type TnFunction = (key: PluralKey, count: number, params?: Params) => string;

const english = en as Dictionary;
// The chain for each store: its own words first, then English. en-GB only lists the words that
// differ from the default English (colour, favourite).
const CHAINS: Record<string, readonly Partial<Dictionary>[]> = {
  'en-DE': [english],
  'de-DE': [de, english],
};

// Messages that come from outside the dictionary (Zod rules in `@store/shared`, API errors) are
// English sentences. Every one worth translating has a `msg.*` entry whose English text equals the
// message, so `tm(message)` can find it again by its text and show it in the shopper's language.
// An unknown message is shown as it is.
const MESSAGE_KEYS = new Map<string, string>();
for (const [key, entry] of Object.entries(en)) {
  if (key.startsWith('msg.') && typeof entry === 'string') MESSAGE_KEYS.set(entry, key);
}

/** Lookup for one locale; a plain function so non-React code (and tests) can use it too. */
export function lookupFor(locale: string) {
  const lookup = makeLookup(CHAINS[locale] ?? [english], english, locale);
  const tm = (message: string): string => {
    const key = MESSAGE_KEYS.get(message);
    return key ? lookup.t(key) : message;
  };
  return { t: lookup.t as TFunction, tn: lookup.tn as TnFunction, has: lookup.has, tm };
}

/** `t('cart.title')`, `tn('cart.items', 3)`: strings in the active store view's language. */
export function useT(): {
  t: TFunction;
  tn: TnFunction;
  has: (key: string) => boolean;
  /** Translates a known English message (validation rule, API error text); others pass through. */
  tm: (message: string) => string;
} {
  const { locale } = useStore();
  return useMemo(() => lookupFor(locale), [locale]);
}
