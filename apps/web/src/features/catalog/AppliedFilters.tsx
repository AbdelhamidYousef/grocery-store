import type { Facets, ProductListQuery } from '@store/shared';

import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
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
  const { t } = useT();
  const fmt = useFormat();
  const chips: { id: string; label: string; remove: () => void }[] = [];

  if (query.inStock)
    chips.push({
      id: 'stock',
      label: t('catalog.filters.inStock'),
      remove: () => update({ inStock: false }),
    });
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    chips.push({
      id: 'price',
      label: priceChipLabel(query.minPrice, query.maxPrice, currency, t, fmt.locale),
      remove: () => update({ minPrice: undefined, maxPrice: undefined }),
    });
  }
  const named = (list: Facets['brand'] | undefined, slug: string) =>
    list?.find((f) => f.value === slug)?.label ?? slug;
  for (const slug of query.brand ?? []) {
    chips.push({
      id: `brand:${slug}`,
      label: t('catalog.filters.chipBrand', { name: named(facets?.brand, slug) }),
      remove: () => update({ brand: (query.brand ?? []).filter((v) => v !== slug) }),
    });
  }
  for (const slug of query.tag ?? []) {
    chips.push({
      id: `tag:${slug}`,
      label: t('catalog.filters.chipHealth', { name: named(facets?.tag, slug) }),
      remove: () => update({ tag: (query.tag ?? []).filter((v) => v !== slug) }),
    });
  }
  for (const slug of query.badge ?? []) {
    chips.push({
      id: `badge:${slug}`,
      label: t('catalog.filters.chipLabel', { name: named(facets?.badge, slug) }),
      remove: () => update({ badge: (query.badge ?? []).filter((v) => v !== slug) }),
    });
  }
  for (const [key, values] of Object.entries(query.attr)) {
    for (const value of values) {
      chips.push({
        id: `${key}:${value}`,
        label: t('catalog.filters.chipFacet', {
          facet: facetLabel(key, t),
          value: formatFacetValue(key, value, t),
        }),
        remove: () => update({ attr: { [key]: values.filter((v) => v !== value) } }),
      });
    }
  }
  if (chips.length === 0) return null;

  return (
    <ul
      aria-label={t('catalog.filters.applied')}
      data-testid={TEST_IDS.filterChips}
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => (
        <li key={chip.id} className="max-w-full">
          <button
            type="button"
            data-testid={TEST_IDS.filterChip}
            aria-label={t('catalog.filters.remove', { label: chip.label })}
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
          {t('catalog.filters.clearAll')}
        </button>
      </li>
    </ul>
  );
}
