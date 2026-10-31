import type { Facets, ProductListQuery } from '@store/shared';

import { TEST_IDS } from '../../lib/test-ids';

import { facetLabel, formatFacetValue, priceChipLabel } from './filters';
import type { ListPatch } from './list-params';

interface AppliedFiltersProps {
  query: ProductListQuery;
  /** Used to show a brand or health need by name instead of its slug. */
  facets?: Facets | undefined;
  currency: string;
  update: (patch: ListPatch) => void;
  onClear: () => void;
}

export function AppliedFilters({ query, facets, currency, update, onClear }: AppliedFiltersProps) {
  const chips: { id: string; label: string; remove: () => void }[] = [];

  if (query.inStock)
    chips.push({ id: 'stock', label: 'In stock', remove: () => update({ inStock: false }) });
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    chips.push({
      id: 'price',
      label: priceChipLabel(query.minPrice, query.maxPrice, currency),
      remove: () => update({ minPrice: undefined, maxPrice: undefined }),
    });
  }
  const named = (list: Facets['brand'] | undefined, slug: string) =>
    list?.find((f) => f.value === slug)?.label ?? slug;
  for (const slug of query.brand ?? []) {
    chips.push({
      id: `brand:${slug}`,
      label: `Brand: ${named(facets?.brand, slug)}`,
      remove: () => update({ brand: (query.brand ?? []).filter((v) => v !== slug) }),
    });
  }
  for (const slug of query.tag ?? []) {
    chips.push({
      id: `tag:${slug}`,
      label: `Health need: ${named(facets?.tag, slug)}`,
      remove: () => update({ tag: (query.tag ?? []).filter((v) => v !== slug) }),
    });
  }
  for (const [key, values] of Object.entries(query.attr)) {
    for (const value of values) {
      chips.push({
        id: `${key}:${value}`,
        label: `${facetLabel(key)}: ${formatFacetValue(key, value)}`,
        remove: () => update({ attr: { [key]: values.filter((v) => v !== value) } }),
      });
    }
  }
  if (chips.length === 0) return null;

  return (
    <ul
      aria-label="Applied filters"
      data-testid={TEST_IDS.filterChips}
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => (
        <li key={chip.id} className="max-w-full">
          <button
            type="button"
            data-testid={TEST_IDS.filterChip}
            aria-label={`Remove filter ${chip.label}`}
            onClick={chip.remove}
            className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-pet-soft px-4 text-left text-sm font-semibold text-pet-strong hover:brightness-95"
          >
            <span className="min-w-0 break-words">{chip.label}</span>
            <span aria-hidden="true">&times;</span>
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 rounded-control px-2 text-sm font-semibold text-primary-strong underline underline-offset-2"
        >
          Clear all
        </button>
      </li>
    </ul>
  );
}
