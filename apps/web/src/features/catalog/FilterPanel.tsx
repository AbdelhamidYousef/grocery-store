import type { Facets, ProductListQuery } from '@store/shared';
import { useRef, useState } from 'react';

import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

import {
  centsToInput,
  FACET_ORDER,
  facetLabel,
  formatFacetValue,
  parsePriceInput,
} from './filters';
import type { ListPatch } from './list-params';

// Long lists (material has ~40 values) show their biggest entries first and fold the rest behind
// a button, so the sidebar stays a few screens at most. Selected values are never hidden.
const VISIBLE_VALUES = 6;
const PRICE_DEBOUNCE_MS = 700;

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
        checked={query.inStock === true}
        onChange={(e) => update({ inStock: e.target.checked })}
        data-testid="filter-in-stock"
      />

      <PriceFilter facets={facets} query={query} currency={currency} update={update} />

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
  values,
  selected,
  onChange,
}: {
  facetKey: string;
  values: { value: string; count: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = facetLabel(facetKey);
  const shown = expanded
    ? values
    : values.filter((v, i) => i < VISIBLE_VALUES || selected.includes(v.value));
  const hidden = values.length - shown.length;

  return (
    // fieldset + legend: a screen reader announces "Material, group" before each option, so the
    // checkbox labels can be just the value.
    <fieldset data-testid={TEST_IDS.filterGroup} className="min-w-0">
      <legend className="mb-1 font-display text-lg font-bold">{label}</legend>
      {/* Expanded, a 38-value list would be ~1700px of checkboxes and push every other group out
          of reach, so it scrolls inside its own box (the checkboxes inside are focusable, so it
          is keyboard-scrollable too). */}
      <div className={cn('flex flex-col', expanded && 'max-h-80 overflow-y-auto pr-1')}>
        {shown.map(({ value, count }) => (
          <Checkbox
            key={value}
            label={`${formatFacetValue(facetKey, value)} (${count})`}
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

function PriceFilter({
  facets,
  query,
  currency,
  update,
}: Pick<FilterPanelProps, 'facets' | 'query' | 'currency' | 'update'>) {
  const [error, setError] = useState<string | undefined>();
  const minRef = useRef<HTMLInputElement>(null);
  const maxRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const symbol = currency === 'EUR' ? '€' : currency;

  // Reads both boxes and writes the URL. Called on blur and Enter right away, and from typing
  // after a pause (debounce), so one keystroke is not one history entry and one request.
  const apply = () => {
    clearTimeout(timer.current);
    const min = parsePriceInput(minRef.current?.value ?? '');
    const max = parsePriceInput(maxRef.current?.value ?? '');
    if ('error' in min || 'error' in max) {
      setError('error' in min ? min.error : 'error' in max ? max.error : undefined);
      return;
    }
    const minCents = 'cents' in min ? min.cents : undefined;
    const maxCents = 'cents' in max ? max.cents : undefined;
    if (minCents !== undefined && maxCents !== undefined && minCents > maxCents) {
      setError('The minimum is higher than the maximum');
      return;
    }
    setError(undefined);
    if (minCents !== query.minPrice || maxCents !== query.maxPrice) {
      update({ minPrice: minCents, maxPrice: maxCents });
    }
  };
  const schedule = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(apply, PRICE_DEBOUNCE_MS);
  };

  const common = {
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    onChange: schedule,
    onBlur: apply,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      }
    },
  };

  return (
    <fieldset className="min-w-0" data-testid="filter-price">
      <legend className="mb-1 font-display text-lg font-bold">Price ({symbol})</legend>
      <div className="flex items-start gap-2">
        {/* `key` ties each box to the URL value: removing the price chip or clearing filters
            re-mounts the box with the new (empty) value. */}
        <Input
          ref={minRef}
          key={`min-${query.minPrice ?? ''}`}
          label="Minimum price"
          defaultValue={centsToInput(query.minPrice)}
          placeholder={facets.price ? String(Math.floor(facets.price.min / 100)) : 'Min'}
          {...common}
        />
        <Input
          ref={maxRef}
          key={`max-${query.maxPrice ?? ''}`}
          label="Maximum price"
          defaultValue={centsToInput(query.maxPrice)}
          placeholder={facets.price ? String(Math.ceil(facets.price.max / 100)) : 'Max'}
          {...common}
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
