import { useQuery } from '@tanstack/react-query';

import { fetchAdminStats } from '../../api/admin';
import { keys } from '../../lib/query-client';

// Back office numbers must be what the database says now, not what it said a minute ago (the
// storefront default), so admin queries are never "fresh": revisiting a screen refetches while
// still showing the cached copy instantly.
const ADMIN_STALE_MS = 0;

export function useAdminStats() {
  return useQuery({
    queryKey: keys.admin.stats,
    queryFn: ({ signal }) => fetchAdminStats(signal),
    staleTime: ADMIN_STALE_MS,
  });
}
