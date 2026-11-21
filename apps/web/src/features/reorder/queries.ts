import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchBuyAgain, fetchUsuals, reorderOrder } from '../../api/reorder';
import { keys } from '../../lib/query-client';
import { useAuthOptional } from '../auth/AuthProvider';

export function useBuyAgain() {
  const { user } = useAuthOptional();
  return useQuery({
    queryKey: keys.buyAgain,
    queryFn: ({ signal }) => fetchBuyAgain(signal),
    enabled: user !== null,
  });
}

// "Your usuals" and the last order. The list is "in stock at your store": the key root is not one of
// the unscoped ones, so a new postcode refetches it.
export function useUsuals() {
  const { user } = useAuthOptional();
  return useQuery({
    queryKey: keys.usuals,
    queryFn: ({ signal }) => fetchUsuals(signal),
    enabled: user !== null,
  });
}

// The server put lines in the cart; the cart cache is refetched rather than patched, so the header
// count and mini cart show what the server holds.
export function useReorder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reorderOrder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.cart }),
  });
}
