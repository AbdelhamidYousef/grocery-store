import { interpolate, pickPlural } from '@store/shared';

import type { Dictionary, Entry, Params } from './types';

// Shared with the API's email dictionaries (packages/shared/src/plural.ts).
export { interpolate, pickPlural };

const warned = new Set<string>();
function warnMissing(locale: string, key: string): void {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') return;
  const id = `${locale}:${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(`[i18n] "${key}" is missing for ${locale}; showing English`);
}

/**
 * Lookup with the fallback chain: the store's own dictionary (en-GB layers over en), then English.
 * A missing string never shows its key: English is complete by construction (the keys are typed
 * from it), so the worst case is a sentence in the wrong language.
 */
export function makeLookup(
  chain: readonly Partial<Dictionary>[],
  english: Dictionary,
  locale: string,
) {
  const find = (key: string): Entry => {
    for (const dict of chain) {
      const hit = dict[key];
      if (hit !== undefined) return hit;
    }
    warnMissing(locale, key);
    return english[key] ?? key;
  };
  return {
    t: (key: string, params?: Params): string => {
      const entry = find(key);
      return interpolate(typeof entry === 'string' ? entry : entry.other, params);
    },
    tn: (key: string, count: number, params?: Params): string => {
      const entry = find(key);
      const template = typeof entry === 'string' ? entry : pickPlural(entry, count, locale);
      return interpolate(template, { count, ...params });
    },
    has: (key: string): boolean => {
      return chain.some((dict) => dict[key] !== undefined);
    },
  };
}
