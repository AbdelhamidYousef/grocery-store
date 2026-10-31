import { forwardRef, useId, type SelectHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

import { controlClasses, describedBy, Field } from './Field';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
}

// A native <select>: free keyboard support, screen-reader semantics and mobile pickers.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id: idProp, children, ...rest },
  ref,
) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <select
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlClasses, className)}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
});
