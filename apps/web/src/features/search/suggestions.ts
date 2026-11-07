import { formatMoney, SUGGEST_MIN_CHARS, type Suggestions } from '@store/shared';

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
export function groupSuggestions(data: Suggestions): OptionGroup[] {
  const groups: OptionGroup[] = [
    {
      id: 'products',
      label: 'Products',
      options: data.products.map((p) => ({
        kind: 'product',
        label: p.name,
        secondary: `from ${formatMoney(p.priceFromCents, p.currency)}`,
        to: `/products/${p.slug}`,
        image: p.imageUrl,
      })),
    },
    {
      id: 'categories',
      label: 'Categories',
      options: data.categories.map((c) => ({
        kind: 'category',
        label: c.name,
        secondary: c.parentName ? `in ${c.parentName}` : '',
        to: `/c/${c.slug}`,
        image: null,
      })),
    },
    {
      id: 'brands',
      label: 'Brands',
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

export function recentGroup(recents: string[]): OptionGroup[] {
  if (recents.length === 0) return [];
  return [
    {
      id: 'recent',
      label: 'Recent searches',
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The sentence a screen reader hears when the list changes: "5 products, 2 brands". */
export function announce(data: Suggestions): string {
  const parts = [
    data.products.length > 0 && plural(data.products.length, 'product', 'products'),
    data.categories.length > 0 && plural(data.categories.length, 'category', 'categories'),
    data.brands.length > 0 && plural(data.brands.length, 'brand', 'brands'),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'No suggestions';
}
