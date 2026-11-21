import { useId, useState } from 'react';

import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  disabled?: boolean;
  /** Names what is being counted ("Rope Tug") so several steppers on one page stay distinguishable. */
  subject?: string;
  /**
   * Cart lines: the typed number is applied on blur or Enter instead of on every keystroke, so
   * clearing the box to type "12" does not first send a request for 1. The buttons always apply
   * at once.
   */
  deferred?: boolean;
}

// A labelled number box with minus and plus buttons. The box stays a real input (type the number,
// or use the arrow keys/spinners), and the buttons exist because a 44px tap target is much easier
// on a phone than the tiny native spinners. Every path clamps to [min, max].
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  subject,
  deferred = false,
}: QuantityStepperProps) {
  const { t } = useT();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) =>
    Math.min(max, Math.max(min, Number.isFinite(n) ? Math.trunc(n) : min));
  const button =
    'flex h-11 w-11 items-center justify-center rounded-control border-2 border-ink font-display text-xl font-bold hover:bg-dept-soft disabled:cursor-not-allowed disabled:border-muted disabled:text-muted disabled:opacity-60';

  // Applies the draft (clamped; an empty or invalid box falls back to the current value) and
  // leaves draft mode so the box shows the real quantity again.
  const commit = () => {
    if (draft === null) return;
    const typed = Number.parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(typed) && clamp(typed) !== value) onChange(clamp(typed));
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid={TEST_IDS.quantity}>
      <label htmlFor={id} className={cn('text-sm font-semibold', subject && 'sr-only')}>
        {subject ? t('catalog.quantity.labelOf', { subject }) : t('catalog.quantity.label')}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={
            subject ? t('catalog.quantity.decreaseOf', { subject }) : t('catalog.quantity.decrease')
          }
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - 1))}
          className={button}
        >
          <span aria-hidden="true">&minus;</span>
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft ?? value}
          disabled={disabled}
          onChange={(e) => {
            if (!deferred) return onChange(clamp(e.target.valueAsNumber));
            setDraft(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && deferred) {
              e.preventDefault();
              commit();
            }
          }}
          className={cn(
            'h-11 w-16 rounded-control border-2 border-muted bg-surface text-center text-base font-semibold',
            disabled && 'opacity-60',
          )}
        />
        <button
          type="button"
          aria-label={
            subject ? t('catalog.quantity.increaseOf', { subject }) : t('catalog.quantity.increase')
          }
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(value + 1))}
          className={button}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}
