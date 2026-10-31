import { useId } from 'react';

import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  disabled?: boolean;
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
}: QuantityStepperProps) {
  const id = useId();
  const clamp = (n: number) =>
    Math.min(max, Math.max(min, Number.isFinite(n) ? Math.trunc(n) : min));
  const button =
    'flex h-11 w-11 items-center justify-center rounded-control border-2 border-ink font-display text-xl font-bold hover:bg-pet-soft disabled:cursor-not-allowed disabled:border-muted disabled:text-muted disabled:opacity-60';

  return (
    <div className="flex flex-col gap-1.5" data-testid={TEST_IDS.quantity}>
      <label htmlFor={id} className="text-sm font-semibold">
        Quantity
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Decrease quantity"
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
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(clamp(e.target.valueAsNumber))}
          className={cn(
            'h-11 w-16 rounded-control border-2 border-muted bg-surface text-center text-base font-semibold',
            disabled && 'opacity-60',
          )}
        />
        <button
          type="button"
          aria-label="Increase quantity"
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
