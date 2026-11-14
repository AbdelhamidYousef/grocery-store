import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

import { useT } from '../../i18n';
import { cn } from '../../lib/cn';

import { controlClasses, describedBy, Field } from './Field';

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hint?: string;
  error?: string;
}

// An Input with a show/hide button. The name flips between "Show password" and "Hide password"
// (the visible text IS the name, WCAG 2.5.3) and the button keeps focus when pressed. `autoComplete`
// must be set by the caller (`current-password` or `new-password`) so password managers behave.
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, hint, error, className, id: idProp, ...rest }, ref) {
    const generated = useId();
    const id = idProp ?? generated;
    const { t } = useT();
    const [visible, setVisible] = useState(false);
    return (
      <Field id={id} label={label} hint={hint} error={error}>
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, hint, error)}
            className={cn(controlClasses, 'pr-36', className)}
            {...rest}
          />
          <button
            type="button"
            data-testid="password-toggle"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 flex min-w-11 items-center rounded-control px-3 text-sm font-semibold text-primary-strong hover:bg-pet-soft"
          >
            {visible ? t('shell.password.hide') : t('shell.password.show')}
          </button>
        </div>
      </Field>
    );
  },
);
