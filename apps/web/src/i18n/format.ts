import { formatMoney } from '@store/shared';
import { useMemo } from 'react';

import { useStore } from '../features/stores/StoreContext';

/**
 * Dates, numbers and money in the store view's locale (`1.234,50 €` in de-DE, `€1,234.50` in
 * en-IE). Formatters are built once per locale, not per call.
 */
export function useFormat() {
  const { locale, currency } = useStore();
  return useMemo(
    () => ({
      locale,
      date: (iso: string, withTime = false): string => {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          ...(withTime ? { timeStyle: 'short' } : {}),
        }).format(date);
      },
      number: (value: number, options?: Intl.NumberFormatOptions): string => {
        return new Intl.NumberFormat(locale, options).format(value);
      },
      money: (cents: number, code: string = currency): string => {
        return formatMoney(cents, code, locale);
      },
    }),
    [locale, currency],
  );
}
