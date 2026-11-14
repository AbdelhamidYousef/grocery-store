import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

import { formatRating } from './format';

const STAR = 'M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9z';

function Row({ className }: { className: string }) {
  return (
    <span className={cn('flex gap-0.5', className)} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className="h-full w-auto shrink-0" fill="currentColor">
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}

// Stars filled to the exact tenth (4.6 fills 92 % of the row), drawn as a grey row with a gold row
// clipped on top. One accessible name for the whole thing ("4.6 out of 5"); the SVGs are hidden.
export function RatingStars({
  tenths,
  className,
  size = 'md',
}: {
  tenths: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const height = { sm: 'h-4', md: 'h-5', lg: 'h-7' }[size];
  return (
    <span
      role="img"
      aria-label={`${formatRating(tenths)} out of 5`}
      data-testid={TEST_IDS.reviewStars}
      className={cn('relative inline-flex', height, className)}
    >
      <Row className="h-full text-line" />
      <span
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${tenths * 2}%` }}
      >
        <Row className="h-full text-star" />
      </span>
    </span>
  );
}
