import { useQuery } from '@tanstack/react-query';

import { fetchShortDated } from '../../api/catalog';
import { keys } from '../../lib/query-client';

/** The short-dated deals of the shopper's store (refetched when the postcode changes). */
export function useShortDated() {
  return useQuery({
    queryKey: keys.products.shortDated,
    queryFn: ({ signal }) => fetchShortDated(signal),
  });
}
