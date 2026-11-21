import { useQuery } from '@tanstack/react-query';

import { fetchDeliveryAreas } from '../../api/delivery';
import { keys } from '../../lib/query-client';

// Four areas, changed only by a seed: fresh for an hour.
export function useDeliveryAreas() {
  return useQuery({
    queryKey: keys.delivery.areas,
    queryFn: ({ signal }) => fetchDeliveryAreas(signal),
    staleTime: 60 * 60_000,
  });
}
