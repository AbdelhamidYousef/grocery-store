import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-surface hover:bg-primary-hover',
  secondary: 'bg-surface text-ink border-2 border-ink hover:bg-dept-soft',
  ghost: 'bg-transparent text-ink hover:bg-dept-soft',
  danger: 'bg-danger text-surface hover:brightness-90',
};

// min-h 44px on md/lg: the WCAG 2.2 / platform minimum touch target.
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-5 text-base',
  lg: 'min-h-12 px-7 text-lg',
};

// The look of a button without the element, for links that navigate: a link is the right element
// when the action is "go to a page" (it can be opened in a new tab, shows its URL on hover).
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md') {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-control font-display font-semibold',
    'transition-colors',
    variants[variant],
    sizes[size],
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // Default to "button" so a Button inside a <form> never submits by accident.
      type="button"
      {...rest}
      // Real `disabled` while loading: blocks double submits and removes it from the tab order.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        buttonClasses(variant, size),
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {loading && <Spinner label={null} className="h-4 w-4" />}
      {children}
    </button>
  );
});
