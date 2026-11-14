import { type UnitPriceDto } from '@store/shared';

import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

interface UnitPriceProps {
  unitPrice: UnitPriceDto | null;
  currency?: string | undefined;
  className?: string;
}

// "€4.20/kg": a price per kilo or litre so pack sizes can be compared. The cents come
// from the server (integer maths, rounded to the nearest cent); this only formats them.
export function UnitPrice({ unitPrice, currency, className }: UnitPriceProps) {
  const format = useFormat();
  if (!unitPrice) return null;
  return (
    <span data-testid={TEST_IDS.unitPrice} className={cn('text-sm text-muted', className)}>
      {format.money(unitPrice.cents, currency)}/{unitPrice.per}
    </span>
  );
}

// Said once per page that shows unit prices, so every "/kg" is explained without repeating it.
export function UnitPriceNote({ className }: { className?: string }) {
  const { t } = useT();
  return <p className={cn('text-xs text-muted', className)}>{t('shell.price.unitNote')}</p>;
}
