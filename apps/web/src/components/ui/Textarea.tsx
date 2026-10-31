import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

import { controlClasses, describedBy, Field } from './Field';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

// Same frame as Input and Select (label, hint, error, aria wiring); only the control differs.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id: idProp, rows = 5, ...rest },
  ref,
) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlClasses, 'py-2', className)}
        {...rest}
      />
    </Field>
  );
});
