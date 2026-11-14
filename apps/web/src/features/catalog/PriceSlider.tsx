import { formatMoney } from '@store/shared';
import { useRef, useState } from 'react';

import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';

// Whole euros: a step of 100 cents keeps the handles on prices a shopper can say out loud.
const STEP = 100;
// Keyboard users hold an arrow key; waiting for a pause avoids one request per step.
const KEY_COMMIT_MS = 500;

interface PriceSliderProps {
  /** Cheapest and dearest price in the current scope, integer cents (the facet). */
  bounds: { min: number; max: number };
  /** The values in the URL; undefined means "no limit on that side". */
  minPrice: number | undefined;
  maxPrice: number | undefined;
  currency: string;
  /** Called on release with the new limits; a handle resting on its end means undefined. */
  onCommit: (minPrice: number | undefined, maxPrice: number | undefined) => void;
}

// Two native range inputs on one track. The handles never cross (the min handle stops at the max
// one), so "min above max" cannot exist, and the URL changes only when the shopper lets go, not
// on every tick of a drag.
export function PriceSlider({ bounds, minPrice, maxPrice, currency, onCommit }: PriceSliderProps) {
  const { t } = useT();
  const { locale } = useFormat();
  const lo = Math.floor(bounds.min / STEP) * STEP;
  const hi = Math.max(Math.ceil(bounds.max / STEP) * STEP, lo + STEP);
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));

  const [draft, setDraft] = useState<{ min: number; max: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<{ min: number; max: number } | null>(null);

  const current = draft ?? {
    min: clamp(minPrice ?? lo),
    max: clamp(maxPrice ?? hi),
  };

  const commit = () => {
    clearTimeout(timer.current);
    const next = latest.current;
    latest.current = null;
    if (!next) return;
    setDraft(null);
    const min = next.min <= lo ? undefined : next.min;
    const max = next.max >= hi ? undefined : next.max;
    if (min !== minPrice || max !== maxPrice) onCommit(min, max);
  };

  const move = (which: 'min' | 'max', raw: string) => {
    const value = Number(raw);
    const next =
      which === 'min'
        ? { min: Math.min(value, current.max), max: current.max }
        : { min: current.min, max: Math.max(value, current.min) };
    latest.current = next;
    setDraft(next);
  };

  const scheduleCommit = () => {
    if (!latest.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(commit, KEY_COMMIT_MS);
  };

  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const money = (v: number) => formatMoney(v, currency, locale);
  const common = {
    min: lo,
    max: hi,
    step: STEP,
    onPointerUp: commit,
    onBlur: commit,
    onKeyUp: scheduleCommit,
  };

  return (
    <fieldset className="min-w-0" data-testid="filter-price">
      <legend className="mb-1 font-display text-lg font-bold">{t('catalog.price.title')}</legend>
      <p className="text-sm font-semibold" data-testid="price-range-text">
        {t('catalog.price.range', { min: money(current.min), max: money(current.max) })}
      </p>
      <div className="dual-range mx-3" data-testid={TEST_IDS.priceSlider}>
        {/* The visible track, with the chosen span in the brand colour. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line"
        />
        <div
          aria-hidden="true"
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${pct(current.min)}%`, right: `${100 - pct(current.max)}%` }}
        />
        <input
          type="range"
          aria-label={t('catalog.price.min')}
          aria-valuetext={money(current.min)}
          value={current.min}
          onChange={(e) => move('min', e.target.value)}
          // When both handles sit at the top end, the min one must be the one on top or it could
          // never be pulled back down.
          style={{ zIndex: current.min > lo + (hi - lo) / 2 ? 2 : 1 }}
          {...common}
        />
        <input
          type="range"
          aria-label={t('catalog.price.max')}
          aria-valuetext={money(current.max)}
          value={current.max}
          onChange={(e) => move('max', e.target.value)}
          style={{ zIndex: 1 }}
          {...common}
        />
      </div>
    </fieldset>
  );
}
