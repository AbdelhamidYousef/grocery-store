import type { Badge as BadgeName } from '@store/shared';

import { useT, type StringKey } from '../../i18n';
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

const LABEL_KEYS: Record<BadgeName, StringKey> = {
  Bestseller: 'shell.badge.bestseller',
  New: 'shell.badge.new',
  Sale: 'shell.badge.sale',
  Eco: 'shell.badge.eco',
  'Low stock': 'shell.badge.lowStock',
};

// The words are derived by the server (never raw stock numbers); this only paints them.
export function ProductBadges({
  badges,
  className,
}: {
  badges: readonly BadgeName[];
  className?: string;
}) {
  const { t } = useT();
  if (badges.length === 0) return null;
  return (
    <ul aria-label={t('shell.badge.highlights')} className={cn('flex flex-wrap gap-1', className)}>
      {badges.map((badge) => (
        <li key={badge}>
          <Badge tone={TONES[badge]} data-testid={TEST_IDS.productBadge}>
            {t(LABEL_KEYS[badge])}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
