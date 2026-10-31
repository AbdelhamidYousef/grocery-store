import { cn } from '../../lib/cn';

// A loading placeholder shape. Hidden from assistive tech: the surrounding region should carry
// `aria-busy` or a Spinner label instead of announcing a dozen grey boxes.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      className={cn('animate-pulse rounded-control bg-line', className)}
    />
  );
}
