import type { Dictionary, Entry, Params, PluralForms } from './types';

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

// Plural rules are per language (English and German have two forms, French treats 0 and 1 as
// singular, Arabic has six), so the form comes from `Intl.PluralRules`, never `n === 1`.
// A `zero` form, where a dictionary defines one, wins for exactly 0.
export function pickPlural(forms: PluralForms, count: number, locale: string): string {
  if (count === 0 && forms.zero !== undefined) return forms.zero;
  const category = new Intl.PluralRules(locale).select(count);
  return category === 'one' ? forms.one : forms.other;
}

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
