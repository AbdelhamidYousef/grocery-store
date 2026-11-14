import { SUGGEST_MIN_CHARS, type Suggestions } from '@store/shared';

import type { TFunction, TnFunction } from '../../i18n';

export type SuggestionOption =
  | { kind: 'product'; label: string; secondary: string; to: string; image: string | null }
  | { kind: 'category'; label: string; secondary: string; to: string; image: null }
  | { kind: 'brand'; label: string; secondary: string; to: string; image: null }
  | { kind: 'recent'; label: string; secondary: string; to: string; image: null };

export interface OptionGroup {
  id: string;
  label: string;
  options: SuggestionOption[];
}

export const searchUrl = (q: string) => `/search?q=${encodeURIComponent(q)}`;

export const isSearchable = (q: string) => q.trim().length >= SUGGEST_MIN_CHARS;

/** Suggestions in the order they are shown (and navigated with the arrow keys). */
export function groupSuggestions(
  data: Suggestions,
  t: TFunction,
  money: (cents: number, currency?: string) => string,
): OptionGroup[] {
  const groups: OptionGroup[] = [
    {
      id: 'products',
      label: t('search.group.products'),
      options: data.products.map((p) => ({
        kind: 'product',
        label: p.name,
        secondary: t('search.from', { price: money(p.priceFromCents, p.currency) }),
        to: `/products/${p.slug}`,
        image: p.imageUrl,
      })),
    },
    {
      id: 'categories',
      label: t('search.group.categories'),
      options: data.categories.map((c) => ({
        kind: 'category',
        label: c.name,
        secondary: c.parentName ? t('search.inParent', { name: c.parentName }) : '',
        to: `/c/${c.slug}`,
        image: null,
      })),
    },
    {
      id: 'brands',
      label: t('search.group.brands'),
      options: data.brands.map((b) => ({
        kind: 'brand',
        label: b.name,
        secondary: '',
        to: `/brands/${b.slug}`,
        image: null,
      })),
    },
  ];
  return groups.filter((g) => g.options.length > 0);
}

export function recentGroup(recents: string[], t: TFunction): OptionGroup[] {
  if (recents.length === 0) return [];
  return [
    {
      id: 'recent',
      label: t('search.group.recent'),
      options: recents.map((term) => ({
        kind: 'recent',
        label: term,
        secondary: '',
        to: searchUrl(term),
        image: null,
      })),
    },
  ];
}

/** The sentence a screen reader hears when the list changes: "5 products, 2 brands". */
export function announce(data: Suggestions, tn: TnFunction): string {
  const parts = [
    data.products.length > 0 && tn('search.count.products', data.products.length),
    data.categories.length > 0 && tn('search.count.categories', data.categories.length),
    data.brands.length > 0 && tn('search.count.brands', data.brands.length),
  ].filter(Boolean);
  return parts.join(', ');
}
