import { useQuery } from '@tanstack/react-query';

import { fetchNavigation } from '../../api/navigation';
import { keys } from '../../lib/query-client';

// The whole menu is one cached call. A failure is not an error for the shopper: the header falls
// back to plain links to each pet's page, so the menu never blocks navigation.
export function useNavigation() {
  return useQuery({
    queryKey: keys.navigation,
    queryFn: ({ signal }) => fetchNavigation(signal),
  });
}
