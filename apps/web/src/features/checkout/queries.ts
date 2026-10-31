import { useQuery } from '@tanstack/react-query';

import { fetchShippingQuotes } from '../../api/checkout';
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
