import type { Facets, ProductListQuery } from '@store/shared';
import { useState } from 'react';

import { Checkbox } from '../../components/ui/Checkbox';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { dietaryLabel, labelLang } from '../../lib/food-labels';
import { TEST_IDS } from '../../lib/test-ids';
import { useStore } from '../stores/StoreContext';

import { FACET_ORDER, facetLabel, formatFacetValue } from './filters';
import type { ListPatch } from './list-params';
import { PriceSlider } from './PriceSlider';

// Long lists (material has ~40 values) show their biggest entries first and fold the rest behind
// a button, so the sidebar stays a few screens at most. Selected values are never hidden.
const VISIBLE_VALUES = 6;

interface FilterPanelProps {
  facets: Facets;
  query: ProductListQuery;
  currency: string;
  update: (patch: ListPatch) => void;
  testId?: string;
}

export function FilterPanel({
  facets,
  query,
  currency,
  update,
  testId = TEST_IDS.filters,
}: FilterPanelProps) {
  const { t } = useT();
  const lang = labelLang(useStore().locale);
  return (
    <div className="flex flex-col gap-6" data-testid={testId}>
      <Checkbox
        label={t('catalog.filters.inStockOnly')}
        // A switch is the right role for an on/off setting that applies at once.
        role="switch"
        checked={query.inStock === true}
        onChange={(e) => update({ inStock: e.target.checked })}
        data-testid="filter-in-stock"
      />

      {facets.price && (
        <PriceSlider
          bounds={facets.price}
          minPrice={query.minPrice}
          maxPrice={query.maxPrice}
          currency={currency}
          onCommit={(minPrice, maxPrice) => update({ minPrice, maxPrice })}
        />
      )}

      {/* Dietary needs come from the product's own food fields (the `diet` URL parameter). Several
          can be on at once and a product must carry all of them. */}
      {(facets.diet.length >= 1 || (query.diet?.length ?? 0) > 0) && (
        <FacetGroup
          facetKey="diet"
          label={t('catalog.facet.diet')}
          testId={TEST_IDS.filterDiet}
          values={facets.diet.map((d) => ({ ...d, label: dietaryLabel(d.value, lang) }))}
          selected={query.diet ?? []}
          onChange={(next) => update({ diet: next })}
        />
      )}

      {/* Brand and shop-by need come from their own tables (slug + display name), not from the
          attributes jsonb, so they are separate groups with their own URL parameters. */}
      {(facets.brand.length >= 2 || (query.brand?.length ?? 0) > 0) && (
        <FacetGroup
          facetKey="brand"
          label={t('catalog.filters.brand')}
          testId={TEST_IDS.filterBrand}
          values={facets.brand}
          selected={query.brand ?? []}
          onChange={(next) => update({ brand: next })}
        />
      )}
      {(facets.tag.length >= 1 || (query.tag?.length ?? 0) > 0) && (
        <FacetGroup
          facetKey="tag"
          label={t('catalog.filters.health')}
          testId={TEST_IDS.filterHealth}
          values={facets.tag}
          selected={query.tag ?? []}
          onChange={(next) => update({ tag: next })}
        />
      )}

      {FACET_ORDER.map((key) => {
        const values = facets.attributes[key] ?? [];
        const selected = query.attr[key] ?? [];
        // A group with a single value cannot narrow anything (a page of frozen food has only
        // "frozen" storage), so it is noise unless something is selected.
        if (values.length < 2 && selected.length === 0) return null;
        return (
          <FacetGroup
            key={key}
            facetKey={key}
            values={values}
            selected={selected}
            onChange={(next) => update({ attr: { [key]: next } })}
          />
        );
      })}
    </div>
  );
}

function FacetGroup({
  facetKey,
  label,
  testId = TEST_IDS.filterGroup,
  values,
  selected,
  onChange,
}: {
  facetKey: string;
  label?: string;
  testId?: string;
  values: { value: string; count: number; label?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const title = label ?? facetLabel(facetKey, t);
  const shown = expanded
    ? values
    : values.filter((v, i) => i < VISIBLE_VALUES || selected.includes(v.value));
  const hidden = values.length - shown.length;

  return (
    // fieldset + legend: a screen reader announces "Material, group" before each option, so the
    // checkbox labels can be just the value.
    <fieldset data-testid={testId} className="min-w-0">
      <legend className="mb-1 font-display text-lg font-bold">{title}</legend>
      {/* Expanded, a 38-value list would be ~1700px of checkboxes and push every other group out
          of reach, so it scrolls inside its own box (the checkboxes inside are focusable, so it
          is keyboard-scrollable too). */}
      <div className={cn('flex flex-col', expanded && 'max-h-80 overflow-y-auto pr-1')}>
        {shown.map(({ value, count, label: valueLabel }) => (
          <Checkbox
            key={value}
            label={t('catalog.filters.option', {
              label: valueLabel ?? formatFacetValue(facetKey, value, t),
              count,
            })}
            checked={selected.includes(value)}
            data-testid={TEST_IDS.filterOption}
            onChange={(e) =>
              onChange(
                e.target.checked ? [...selected, value] : selected.filter((v) => v !== value),
              )
            }
          />
        ))}
      </div>
      {(hidden > 0 || expanded) && values.length > VISIBLE_VALUES && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 min-h-11 rounded-control font-semibold text-primary-strong underline underline-offset-2"
        >
          {expanded
            ? t('catalog.filters.showFewer', { label: title.toLowerCase() })
            : t('catalog.filters.showMore', { count: hidden })}
        </button>
      )}
    </fieldset>
  );
}
