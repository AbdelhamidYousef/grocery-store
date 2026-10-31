import { sumCents } from '@store/shared';

import type { WebCart } from '../../api/cart';

// Recomputes the totals the server would send after changing one line, so the optimistic cache
// shows the right numbers at once. Mirrors the API: a sold-out line (available 0) stays visible
// but counts toward neither the subtotal nor the item count. Integer cents only. The server's
// answer replaces this guess as soon as it arrives, so a rounding disagreement cannot persist.
export function withLineQuantity(cart: WebCart, itemId: string, quantity: number): WebCart {
  const items = cart.items.flatMap((item) => {
    if (item.id !== itemId) return [item];
    if (quantity <= 0) return [];
    return [{ ...item, quantity, lineTotalCents: item.unitPriceCents * quantity }];
  });
  const buyable = items.filter((item) => item.available > 0);
  return {
    ...cart,
    items,
    subtotalCents: sumCents(buyable.map((item) => item.lineTotalCents)),
    itemCount: buyable.reduce((n, item) => n + item.quantity, 0),
  };
}
