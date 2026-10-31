import type { Order } from '@store/shared';
import { useEffect } from 'react';

import { track } from '../../lib/track';

// `purchase` must fire once per order, however often the page is reloaded or revisited, or the
// revenue in analytics would be counted again. The "already sent" marker lives in sessionStorage
// (per tab); storage can be blocked, in which case we would rather skip tracking than risk a
// duplicate.
function claim(orderNumber: string): boolean {
  try {
    const key = `purchase-tracked:${orderNumber}`;
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

export function usePurchaseTracking(order: Order | undefined, paid: boolean) {
  useEffect(() => {
    if (!order || !paid || !claim(order.number)) return;
    track({
      name: 'purchase',
      orderNumber: order.number,
      valueCents: order.totals.totalCents,
      currency: order.totals.currency,
      items: order.items.map((i) => ({
        id: i.id,
        name: i.productName,
        price: i.unitPriceCents,
        variant: i.sku,
      })),
    });
  }, [order, paid]);
}
