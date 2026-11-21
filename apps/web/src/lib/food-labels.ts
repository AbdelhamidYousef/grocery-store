import { ALLERGENS, DIETARY_TAGS } from '@store/shared';

import { useStore } from '../features/stores/StoreContext';

// Allergen and dietary labels come with both languages on the shared constants (so the API, the
// admin and the page agree on the 14 allergens); this picks the one for the active store view.
type Lang = 'en' | 'de';

export function labelLang(locale: string): Lang {
  return locale.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function allergenLabel(slug: string, lang: Lang): string {
  return ALLERGENS.find((a) => a.slug === slug)?.[lang] ?? slug;
}

export function dietaryLabel(slug: string, lang: Lang): string {
  return DIETARY_TAGS.find((d) => d.slug === slug)?.[lang] ?? slug;
}

export function useFoodLabels(): {
  lang: Lang;
  allergen: (slug: string) => string;
  dietary: (slug: string) => string;
} {
  const lang = labelLang(useStore().locale);
  return {
    lang,
    allergen: (slug) => allergenLabel(slug, lang),
    dietary: (slug) => dietaryLabel(slug, lang),
  };
}
