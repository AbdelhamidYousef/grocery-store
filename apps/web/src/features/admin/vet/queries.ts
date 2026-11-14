import type { VetDecision } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { decideVetApproval, fetchAdminVetApprovals, type VetAction } from '../../../api/admin-vet';
import { keys } from '../../../lib/query-client';

export function useAdminVetApprovals(decision: VetDecision, page: number) {
  return useQuery({
    queryKey: keys.admin.vet(decision, page),
    queryFn: ({ signal }) => fetchAdminVetApprovals(decision, page, signal),
    staleTime: 0,
  });
}

// A decision moves the order (processing or cancelled), changes stock on a rejection and the
// customer's own order, so the queue, the admin orders, products and the shopper's view refresh.
export function useVetDecision(orderNumber: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VetAction) => decideVetApproval(orderNumber, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.admin.vetAll }),
        queryClient.invalidateQueries({ queryKey: keys.admin.orders }),
        queryClient.invalidateQueries({ queryKey: keys.admin.products }),
        queryClient.invalidateQueries({ queryKey: keys.account.all }),
      ]),
  });
}
