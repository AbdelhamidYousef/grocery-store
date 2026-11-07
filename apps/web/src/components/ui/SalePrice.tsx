import { formatMoney, type SaleOffer } from '@store/shared';

import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

import { VisuallyHidden } from './VisuallyHidden';

interface SalePriceProps {
  sale: SaleOffer;
  currency?: string;
  className?: string;
}

// A flash-sale price. EU Omnibus rules: a reduction is announced against the lowest price of the
// 30 days before the sale (the API's `referenceCents`), so THAT is the struck-through "was" price,
// never the regular price, and it is also written next to every sale price in words. No reference
// (no price history), or a reference not above the sale price: no strike-through.
export function SalePrice({ sale, currency, className }: SalePriceProps) {
  const fmt = (value: number) => formatMoney(value, currency);
  return (
    <span className={cn('flex flex-col', className)} data-testid="price">
      <span className="inline-flex flex-wrap items-baseline gap-x-2">
        <span className="font-display font-bold" data-testid={TEST_IDS.salePrice}>
          {fmt(sale.priceCents)}
        </span>
        {sale.referenceCents !== null && sale.referenceCents > sale.priceCents && (
          <s className="text-sm text-muted" data-testid={TEST_IDS.saleStrike}>
            <VisuallyHidden>Was </VisuallyHidden>
            {fmt(sale.referenceCents)}
          </s>
        )}
      </span>
      {sale.referenceCents !== null && (
        <span className="text-xs font-normal text-muted" data-testid={TEST_IDS.saleOmnibus}>
          Lowest price in the last 30 days: {fmt(sale.referenceCents)}
        </span>
      )}
    </span>
  );
}
