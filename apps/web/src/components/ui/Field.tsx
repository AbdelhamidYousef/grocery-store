import type { ReactNode } from 'react';

import { useT } from '../../i18n';

// Shared label / hint / error frame for Input and Select. The caller passes the generated ids so
// the control can point `aria-describedby` at the hint and error text.
interface FieldProps {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}

export function Field({ id, label, hint, error, children }: FieldProps) {
  const { tm } = useT();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-danger">
          {tm(error)}
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return ids || undefined;
}

export const controlClasses =
  'min-h-11 w-full rounded-control border-2 border-muted bg-surface px-3 text-base text-ink ' +
  'placeholder:text-muted aria-[invalid=true]:border-danger disabled:opacity-60';
