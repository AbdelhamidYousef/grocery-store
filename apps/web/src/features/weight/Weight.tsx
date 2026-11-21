import { authorisationCents, formatGrams } from '@store/shared';

import type { WebCartItem } from '../../api/cart';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

// "about 500 g · 3.78 EUR/kg · est. 1.89 EUR": what a weighed item is, said once, in the same words
// on the product page, the cart and the card.
export function WeightLine({
  grams,
  pricePerKgCents,
  estimateCents,
  currency,
  className,
}: {
  grams: number;
  pricePerKgCents: number;
  estimateCents: number;
  currency: string;
  className?: string;
}) {
  const { t } = useT();
  const fmt = useFormat();
  return (
    <p data-testid={TEST_IDS.weightLine} className={cn('text-sm text-muted', className)}>
      {t('weight.about', {
        weight: formatGrams(grams, fmt.locale),
        perKg: fmt.money(pricePerKgCents, currency),
        price: fmt.money(estimateCents, currency),
      })}
    </p>
  );
}

/** The weighed lines of a cart (their line totals are estimates until the bag is weighed). */
export function weighedLineCents(items: readonly WebCartItem[]): number[] {
  return items.filter((i) => i.weight && i.available > 0).map((i) => i.lineTotalCents);
}

/**
 * "Final price after weighing. We hold up to 2.17 EUR on your card and take only what it weighs."
 * Shown only when the cart has a weighed line. `totalCents` is the order total at the estimate.
 */
export function WeighedNotice({
  items,
  totalCents,
  currency,
  className,
}: {
  items: readonly WebCartItem[];
  totalCents: number;
  currency: string;
  className?: string;
}) {
  const { t } = useT();
  const fmt = useFormat();
  const weighed = weighedLineCents(items);
  if (weighed.length === 0) return null;
  return (
    <p
      data-testid={TEST_IDS.weighedNotice}
      className={cn('rounded-control bg-dept-soft p-3 text-sm font-semibold', className)}
    >
      {t('weight.notice', {
        max: fmt.money(authorisationCents(totalCents, weighed), currency),
      })}
    </p>
  );
}
