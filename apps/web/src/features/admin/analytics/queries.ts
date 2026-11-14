import type { AnalyticsInterval } from '@store/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchAdminAnalytics } from '../../../api/admin-analytics';
import { keys } from '../../../lib/query-client';

export function useAdminAnalytics(
  from: string,
  to: string,
  interval: AnalyticsInterval,
  currency: string,
) {
  return useQuery({
    queryKey: keys.admin.analytics(from, to, interval, currency),
    queryFn: ({ signal }) => fetchAdminAnalytics(from, to, interval, currency, signal),
    staleTime: 0,
  });
}
