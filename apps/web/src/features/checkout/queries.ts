import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchShippingQuotes, placeOrder } from '../../api/checkout';
import { ApiError } from '../../api/client';
import { keys } from '../../lib/query-client';
import { useCart } from '../cart/queries';

// Quotes for the caller's current cart. The key carries the numbers the server prices from
// (subtotal and weight), so adding to the cart gives a fresh quote instead of a stale cached one.
export function useShippingQuotes(country: string | null) {
  const { data: cart } = useCart();
  const subtotal = cart?.subtotalCents ?? 0;
  const weight = cart?.weightGrams ?? 0;
  return useQuery({
    queryKey: keys.shipping(country ?? '', subtotal, weight),
    queryFn: ({ signal }) => fetchShippingQuotes(country ?? '', signal),
    // An empty cart has nothing to quote (and the call would create a cart row for nobody).
    enabled: Boolean(country) && (cart?.items.length ?? 0) > 0,
    staleTime: 30_000,
  });
}

// Every supported country is one shipping zone today, so any of them gives the same thresholds.
const HINT_COUNTRY = 'DE';

// The subtotal from which standard shipping is free, read from the API's own rules (null while
// loading, or when no method is ever free). The cart only uses it for a hint; checkout charges
// whatever the server computes.
export function useFreeShippingThreshold(): number | null {
  const { data } = useShippingQuotes(HINT_COUNTRY);
  const thresholds = (data ?? []).flatMap((q) =>
    q.freeOverCents === null ? [] : [q.freeOverCents],
  );
  return thresholds.length > 0 ? Math.min(...thresholds) : null;
}

// ---------- placing the order ----------

// Creates (or updates) the cart's pending order and its payment intent. The cart is NOT touched on
// success: the server converts it only when the payment is confirmed, so a shopper who abandons
// the payment step still has a cart. A 409 CART_CHANGED means the server repriced something, so
// the cart is refetched and the page shows what changed.
export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: placeOrder,
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'CART_CHANGED') {
        void queryClient.invalidateQueries({ queryKey: keys.cart });
      }
    },
  });
}
