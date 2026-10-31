import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'danger' | 'pet';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

// Every tone pairs a dark text colour with a tint, checked in styles/tokens.test.ts.
// `pet` follows the nearest `data-pet` wrapper.
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-bg text-ink border border-line',
  primary: 'bg-primary-soft text-primary-strong',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  pet: 'bg-pet-soft text-pet-strong',
};

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
