import { useQuery } from '@tanstack/react-query';

import { fetchActiveSafetyNotices } from '../../api/safety';
import { keys } from '../../lib/query-client';

export function useActiveSafetyNotices() {
  return useQuery({
    queryKey: keys.safety.active,
    queryFn: ({ signal }) => fetchActiveSafetyNotices(signal),
  });
}
