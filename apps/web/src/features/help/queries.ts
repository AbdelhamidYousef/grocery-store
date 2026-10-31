import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { searchHelp, type HelpSearchParams } from '../../api/help';
import { keys } from '../../lib/query-client';

export function useHelpSearch(params: HelpSearchParams) {
  return useQuery({
    queryKey: keys.help.search(params),
    queryFn: ({ signal }) => searchHelp(params, signal),
    placeholderData: keepPreviousData,
  });
}
