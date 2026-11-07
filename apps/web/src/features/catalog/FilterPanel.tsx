import type { Facets, ProductListQuery } from '@store/shared';
import { useState } from 'react';

import { Checkbox } from '../../components/ui/Checkbox';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

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
  return (
    <div className="flex flex-col gap-6" data-testid={testId}>
      <Checkbox
        label="In stock only"
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

      {/* Brand and health need come from their own tables (slug + display name), not from the
          attributes jsonb, so they are separate groups with their own URL parameters. */}
      {(facets.brand.length >= 2 || (query.brand?.length ?? 0) > 0) && (
        <FacetGroup
          facetKey="brand"
          label="Brand"
          testId={TEST_IDS.filterBrand}
          values={facets.brand}
          selected={query.brand ?? []}
          onChange={(next) => update({ brand: next })}
        />
      )}
      {(facets.tag.length >= 1 || (query.tag?.length ?? 0) > 0) && (
        <FacetGroup
          facetKey="tag"
          label="Shop by health need"
          testId={TEST_IDS.filterHealth}
          values={facets.tag}
          selected={query.tag ?? []}
          onChange={(next) => update({ tag: next })}
        />
      )}

      {FACET_ORDER.map((key) => {
        const values = facets.attributes[key] ?? [];
        const selected = query.attr[key] ?? [];
        // A group with a single value cannot narrow anything (brand is always "Pawsome"; the pet
        // group on a dog page is always "dog"), so it is noise unless something is selected.
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
  label = facetLabel(facetKey),
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
  const [expanded, setExpanded] = useState(false);
  const shown = expanded
    ? values
    : values.filter((v, i) => i < VISIBLE_VALUES || selected.includes(v.value));
  const hidden = values.length - shown.length;

  return (
    // fieldset + legend: a screen reader announces "Material, group" before each option, so the
    // checkbox labels can be just the value.
    <fieldset data-testid={testId} className="min-w-0">
      <legend className="mb-1 font-display text-lg font-bold">{label}</legend>
      {/* Expanded, a 38-value list would be ~1700px of checkboxes and push every other group out
          of reach, so it scrolls inside its own box (the checkboxes inside are focusable, so it
          is keyboard-scrollable too). */}
      <div className={cn('flex flex-col', expanded && 'max-h-80 overflow-y-auto pr-1')}>
        {shown.map(({ value, count, label: valueLabel }) => (
          <Checkbox
            key={value}
            label={`${valueLabel ?? formatFacetValue(facetKey, value)} (${count})`}
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
          {expanded ? `Show fewer ${label.toLowerCase()} options` : `Show ${hidden} more`}
        </button>
      )}
    </fieldset>
  );
}
