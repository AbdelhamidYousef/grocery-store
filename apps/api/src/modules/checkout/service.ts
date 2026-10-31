import type { ShippingQuote } from '@store/shared';

import { getCart } from '../cart/service.ts';

import * as repo from './repo.ts';
import { quote } from './shipping.ts';

// Prices every active method for the caller's current cart. Weight and subtotal come from the
// re-priced cart (never from the client), and sold-out lines are already excluded from both.
export async function getShippingQuotes(cartId: string, country: string): Promise<ShippingQuote[]> {
  const [cart, methods] = await Promise.all([getCart(cartId), repo.listActiveShippingMethods()]);
  return quote(methods, {
    country,
    weightGrams: cart.weightGrams,
    subtotalCents: cart.subtotalCents,
    currency: cart.currency,
  });
}
