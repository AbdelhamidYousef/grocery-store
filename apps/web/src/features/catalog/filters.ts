import { FACET_KEYS, formatMoney, type FacetKey, type ProductSort } from '@store/shared';

export const FACET_LABELS: Record<FacetKey, string> = {
  pet: 'Pet',
  material: 'Material',
  brand: 'Brand',
  ageStage: 'Age stage',
};

export const FACET_ORDER: readonly FacetKey[] = FACET_KEYS;

const PET_LABELS: Record<string, string> = {
  dog: 'Dogs',
  cat: 'Cats',
  bird: 'Birds',
  fish: 'Fish',
  small: 'Small pets',
};

// Facet values are raw data ("small", "all", "baked meat and oat treats"); this makes them
// readable without hardcoding which values exist.
export function formatFacetValue(key: string, value: string): string {
  if (key === 'pet') return PET_LABELS[value] ?? capitalise(value);
  if (key === 'ageStage' && value === 'all') return 'All ages';
  return capitalise(value);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function facetLabel(key: string): string {
  return key in FACET_LABELS ? FACET_LABELS[key as FacetKey] : capitalise(key);
}

export const SORT_LABELS: Record<ProductSort, string> = {
  relevance: 'Best match',
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  name: 'Name: A to Z',
};

export function sortOptions(hasSearch: boolean): ProductSort[] {
  return hasSearch
    ? ['relevance', 'newest', 'price_asc', 'price_desc', 'name']
    : ['newest', 'price_asc', 'price_desc', 'name'];
}

export function defaultSort(hasSearch: boolean): ProductSort {
  return hasSearch ? 'relevance' : 'newest';
}

export type PriceInput = { cents: number } | { empty: true } | { error: string };

// "12", "12.5", "12.50" -> cents, by splitting on the dot: no float multiplication, so 19.99
// never becomes 1998.9999. Anything else is an error shown next to the field.
export function parsePriceInput(text: string): PriceInput {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return { empty: true };
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return { error: 'Enter a price like 12.50' };
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  return { cents: whole * 100 + fraction };
}

export function centsToInput(cents: number | undefined): string {
  if (cents === undefined) return '';
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

export function priceChipLabel(
  min: number | undefined,
  max: number | undefined,
  currency: string,
): string {
  if (min !== undefined && max !== undefined)
    return `Price: ${formatMoney(min, currency)} - ${formatMoney(max, currency)}`;
  if (min !== undefined) return `Price: from ${formatMoney(min, currency)}`;
  return `Price: up to ${formatMoney(max ?? 0, currency)}`;
}
