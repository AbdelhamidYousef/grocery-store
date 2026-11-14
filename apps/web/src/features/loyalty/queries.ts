import { useQuery } from '@tanstack/react-query';

import { fetchPoints } from '../../api/loyalty';
import { keys } from '../../lib/query-client';
import { useAuthOptional } from '../auth/AuthProvider';

// The balance, tier and last 50 rows. Only asked for a signed-in shopper (a guest would get a 401
// the app would read as an expired session).
export function usePoints() {
  const { user } = useAuthOptional();
  return useQuery({
    queryKey: keys.points,
    queryFn: ({ signal }) => fetchPoints(signal),
    enabled: user !== null,
  });
}
