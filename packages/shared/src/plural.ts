// Text with `{name}` holes and per-language plural forms, shared by the web dictionaries and the
// API's email dictionaries so both pick a plural the same way.

export interface PluralForms {
  /** Used for a count of exactly 0 when a language wants different words there ("No items"). */
  zero?: string;
  one: string;
  other: string;
}
export type TextEntry = string | PluralForms;
export type TextParams = Record<string, string | number>;

export function interpolate(template: string, params?: TextParams): string {
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
