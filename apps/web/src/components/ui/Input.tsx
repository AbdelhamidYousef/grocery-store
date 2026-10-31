import { forwardRef, useId, type InputHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

import { controlClasses, describedBy, Field } from './Field';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Required: every input has a visible, programmatically associated label. */
  label: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id: idProp, ...rest },
  ref,
) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlClasses, className)}
        {...rest}
      />
    </Field>
  );
});
