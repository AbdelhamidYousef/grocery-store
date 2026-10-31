import { cn } from '../../lib/cn';

import { VisuallyHidden } from './VisuallyHidden';

interface SpinnerProps {
  /** Spoken label. Pass `null` when a parent already announces the busy state (e.g. a Button). */
  label?: string | null;
  className?: string;
}

export function Spinner({ label = 'Loading', className }: SpinnerProps) {
  const icon = (
    <svg
      className={cn('h-5 w-5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  if (label === null) return icon;
  return (
    <span role="status" className="inline-flex items-center" data-testid="spinner">
      {icon}
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
