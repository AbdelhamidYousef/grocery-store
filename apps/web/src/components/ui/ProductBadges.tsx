import type { Badge as BadgeName } from '@store/shared';

import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

import { Badge, type BadgeTone } from './Badge';

// Each badge has a fixed tone so a shopper learns the colours: sale is red, new is green.
const TONES: Record<BadgeName, BadgeTone> = {
  Bestseller: 'primary',
  New: 'success',
  Sale: 'danger',
  Eco: 'success',
  'Low stock': 'neutral',
};

// The words are derived by the server (never raw stock numbers); this only paints them.
export function ProductBadges({
  badges,
  className,
}: {
  badges: readonly BadgeName[];
  className?: string;
}) {
  if (badges.length === 0) return null;
  return (
    <ul aria-label="Highlights" className={cn('flex flex-wrap gap-1', className)}>
      {badges.map((badge) => (
        <li key={badge}>
          <Badge tone={TONES[badge]} data-testid={TEST_IDS.productBadge}>
            {badge}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
