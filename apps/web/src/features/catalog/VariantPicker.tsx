import type { Variant } from '@store/shared';
import { useId } from 'react';

import { useT, type StringKey, type TFunction } from '../../i18n';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

import {
  findVariant,
  optionStatus,
  optionValues,
  selectionOf,
  type OptionStatus,
} from './resolve-variant';

// Above this many values a row of buttons stops fitting on a phone, so the group becomes a select.
const MAX_BUTTONS = 6;

// Swatch colours for common colour names. Only decoration: the colour's name is always the
// accessible label, so an unknown name still works (it gets a neutral swatch).
const SWATCHES: Record<string, string> = {
  black: '#1f1b2e',
  white: '#ffffff',
  grey: '#9ca3af',
  red: '#dc2626',
  orange: '#f97316',
  yellow: '#facc15',
  green: '#22c55e',
  lime: '#a3e635',
  teal: '#14b8a6',
  blue: '#3b82f6',
  navy: '#1e3a8a',
  sky: '#7dd3fc',
  purple: '#8b5cf6',
  lilac: '#c4b5fd',
  pink: '#f472b6',
  blush: '#fbcfe8',
  plum: '#7e22ce',
  brown: '#92400e',
  cream: '#fef3c7',
  sand: '#e7d3b0',
  natural: '#d6bf94',
  mint: '#a7f3d0',
  sage: '#9caf88',
  slate: '#64748b',
  mustard: '#ca8a04',
  clear: '#e0f2fe',
};

const SIZE_NAMES: Record<string, StringKey> = {
  XS: 'catalog.variant.sizeXS',
  S: 'catalog.variant.sizeS',
  M: 'catalog.variant.sizeM',
  L: 'catalog.variant.sizeL',
  XL: 'catalog.variant.sizeXL',
};

// A product with a free sample has one `pack` option: the full pack or the sample.
const PACK_NAMES: Record<string, StringKey> = {
  full: 'catalog.variant.packFull',
  trial: 'catalog.variant.packTrial',
};

export function optionKeyLabel(key: string, t: TFunction): string {
  if (key === 'color') return t('catalog.variant.colour');
  if (key === 'pack') return t('catalog.variant.pack');
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function optionValueLabel(key: string, value: string, t: TFunction): string {
  const sizeKey = SIZE_NAMES[value];
  if (key === 'size') return sizeKey ? t(sizeKey) : value;
  const packKey = key === 'pack' ? PACK_NAMES[value] : undefined;
  if (packKey) return t(packKey);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface VariantPickerProps {
  optionKeys: readonly string[];
  variants: readonly Variant[];
  selected: Variant;
  onSelect: (variant: Variant) => void;
}

// One group per option key, built entirely from the data: nothing here says "colour" or "size"
// except labels and swatches. Each group is a fieldset of native radios (or a native select), so
// keyboard use is the platform's: Tab into the group, arrow keys to choose, no custom handlers.
export function VariantPicker({ optionKeys, variants, selected, onSelect }: VariantPickerProps) {
  const { t } = useT();
  const prefix = useId();
  if (optionKeys.length === 0) return null;
  const selection = selectionOf(selected, optionKeys);

  const choose = (key: string, value: string) => {
    const next = findVariant(variants, { ...selection, [key]: value });
    if (next) onSelect(next);
  };

  return (
    <div className="flex flex-col gap-4" data-testid={TEST_IDS.variantPicker}>
      {optionKeys.map((key) => {
        const values = optionValues(variants, key);
        const current = selection[key] ?? '';
        // A choice is disabled when that combination does not exist or is sold out. The value
        // already selected stays enabled, so the picker never shows a dead end for the page's
        // own variant (for example a sold-out default).
        const status = (value: string): OptionStatus =>
          optionStatus(variants, selection, key, value);
        const disabled = (value: string) => status(value) !== 'available' && value !== current;
        // The value's name, with the reason when its choice is disabled.
        const named = (value: string) => {
          const label = optionValueLabel(key, value, t);
          const state = status(value);
          if (state === 'sold-out') return t('catalog.variant.soldOut', { label });
          if (state === 'unavailable') return t('catalog.variant.unavailable', { label });
          return label;
        };

        if (values.length > MAX_BUTTONS) {
          const id = `${prefix}-${key}`;
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="font-display text-lg font-bold">
                {optionKeyLabel(key, t)}
              </label>
              <select
                id={id}
                value={current}
                data-testid={TEST_IDS.variantOption}
                onChange={(e) => choose(key, e.target.value)}
                className="min-h-11 w-full rounded-control border-2 border-muted bg-surface px-3 text-base"
              >
                {values.map((value) => (
                  <option key={value} value={value} disabled={disabled(value)}>
                    {named(value)}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        const isColor = key === 'color';
        return (
          <fieldset key={key} className="min-w-0">
            <legend className="mb-2 font-display text-lg font-bold">
              {optionKeyLabel(key, t)}
              {/* Without this the group's name reads "ColourYellow". */}
              <span className="sr-only">: </span>
              <span className="ml-2 font-sans text-base font-normal text-muted">
                {optionValueLabel(key, current, t)}
              </span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {values.map((value) => {
                const label = optionValueLabel(key, value, t);
                const off = disabled(value);
                return (
                  <label
                    key={value}
                    className={cn('relative', off ? 'cursor-not-allowed' : 'cursor-pointer')}
                  >
                    <input
                      type="radio"
                      name={`${prefix}-${key}`}
                      value={value}
                      checked={value === current}
                      disabled={off}
                      data-testid={TEST_IDS.variantOption}
                      onChange={() => choose(key, value)}
                      className="peer sr-only"
                    />
                    {/* The visible chip. `peer-checked` / `peer-focus-visible` style it from the
                        hidden radio's real state, so what you see is what a screen reader hears. */}
                    {isColor ? (
                      <span
                        aria-hidden="true"
                        title={named(value)}
                        style={{ backgroundColor: SWATCHES[value] ?? '#d4d4d8' }}
                        className={cn(
                          'block h-11 w-11 rounded-full border-2 border-line ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink',
                          off &&
                            'opacity-40 [background-image:linear-gradient(135deg,transparent_45%,#1f1b2e_45%,#1f1b2e_55%,transparent_55%)]',
                        )}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex min-h-11 min-w-11 items-center justify-center rounded-control border-2 border-ink px-4 text-center font-display font-semibold peer-checked:bg-ink peer-checked:text-surface peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
                          off && 'border-muted text-muted line-through opacity-60',
                        )}
                      >
                        {label}
                      </span>
                    )}
                    {/* The accessible name, including why a choice is disabled. */}
                    <span className="sr-only">{named(value)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
