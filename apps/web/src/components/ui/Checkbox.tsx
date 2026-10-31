import { forwardRef, useId, type InputHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, className, id: idProp, ...rest },
  ref,
) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <div className="flex flex-col gap-1">
      {/* The whole row is the label, so the click target is at least 44px tall. */}
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn('h-5 w-5 shrink-0 cursor-pointer accent-primary', className)}
          {...rest}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
