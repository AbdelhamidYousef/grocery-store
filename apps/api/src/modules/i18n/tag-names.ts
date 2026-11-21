import { currentLang } from './context.ts';

// The "shop by need" tags are plain rows with one English name (there is no translation table for
// them), so the German names live here, keyed by the tag's slug. A tag with no entry (an admin made
// it) keeps its English name, like every other untranslated field.
const DE: Record<string, string> = {
  breakfast: 'Frühstück',
  'quick-dinner': 'Schnelles Abendessen',
  baking: 'Backen',
  party: 'Partysnacks',
  lunchbox: 'Brotdose',
  'cleaning-day': 'Putztag',
};

const BY_LANG: Record<string, Record<string, string>> = { de: DE };

/** The tag's name in the request's language; English (the stored name) when there is none. */
export function tagName(slug: string, name: string, lang: string = currentLang()): string {
  return BY_LANG[lang]?.[slug] ?? name;
}
