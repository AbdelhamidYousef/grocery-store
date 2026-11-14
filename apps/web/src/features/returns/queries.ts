import type { ReturnRequestBody } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchOrderReturns, requestReturn } from '../../api/returns';
import { keys } from '../../lib/query-client';
import { track } from '../../lib/track';

// Only asked for orders that can have returns (delivered or already refunded): the API refuses the
// rest anyway, so the page does not even try.
export function useOrderReturns(number: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.account.returns(number),
    queryFn: ({ signal }) => fetchOrderReturns(number, signal),
    enabled,
    staleTime: 0,
  });
}

export function useRequestReturn(number: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReturnRequestBody) => requestReturn(number, body),
    onSuccess: (created) => {
      track({
        name: 'return_requested',
        orderNumber: number,
        items: created.items.length,
        reason: created.reason,
      });
      return queryClient.invalidateQueries({ queryKey: keys.account.returns(number) });
    },
  });
}
