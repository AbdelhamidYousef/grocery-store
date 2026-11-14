import type { ReturnStatus } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  actOnReturn,
  fetchAdminReturn,
  fetchAdminReturns,
  type ReturnAction,
} from '../../../api/returns';
import { keys } from '../../../lib/query-client';

export function useAdminReturns(status: ReturnStatus | undefined, page: number) {
  return useQuery({
    queryKey: keys.admin.returnList(status ?? 'all', page),
    queryFn: ({ signal }) => fetchAdminReturns(status, page, signal),
    staleTime: 0,
  });
}

export function useAdminReturn(id: string) {
  return useQuery({
    queryKey: keys.admin.return(id),
    queryFn: ({ signal }) => fetchAdminReturn(id, signal),
    staleTime: 0,
  });
}

// An action changes the return, can change stock (receive), the order (the last refund) and the
// customer's own view, so the admin lists, the order and the shopper's returns all refresh.
export function useReturnAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReturnAction) => actOnReturn(id, input),
    onSuccess: async (detail) => {
      queryClient.setQueryData(keys.admin.return(id), detail);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.admin.returns }),
        queryClient.invalidateQueries({ queryKey: keys.admin.orders }),
        queryClient.invalidateQueries({ queryKey: keys.admin.products }),
        queryClient.invalidateQueries({ queryKey: keys.account.all }),
      ]);
    },
  });
}
