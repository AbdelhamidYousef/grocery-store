import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { cn } from '../../lib/cn';

import { VisuallyHidden } from './VisuallyHidden';

interface PriceProps {
  cents: number;
  /** Set for a "from - to" range across variants. */
  maxCents?: number;
  /** Original price, shown struck through when higher than `cents`. */
  compareAtCents?: number | null;
  currency?: string;
  className?: string;
}

export function Price({ cents, maxCents, compareAtCents, currency, className }: PriceProps) {
  const { t } = useT();
  const format = useFormat();
  const fmt = (value: number) => format.money(value, currency);
  const isRange = maxCents !== undefined && maxCents !== cents;
  const onSale = compareAtCents != null && compareAtCents > cents && !isRange;
  return (
    <span
      className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}
      data-testid="price"
    >
      <span className="font-display font-bold" data-testid="price-current">
        {isRange ? `${fmt(cents)} - ${fmt(maxCents)}` : fmt(cents)}
      </span>
      {onSale && (
        <s className="text-sm text-muted" data-testid="price-compare">
          <VisuallyHidden>{t('shell.price.original')} </VisuallyHidden>
          {fmt(compareAtCents)}
        </s>
      )}
    </span>
  );
}
