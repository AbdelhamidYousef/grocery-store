import type { AdminProductContentInput } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchAdminContent, putAdminContent } from '../../../api/admin-pdp';
import { keys } from '../../../lib/query-client';

// Never "fresh", like the other admin hooks.
const FRESH = 0;

export const useAdminContent = (productId: string) =>
  useQuery({
    queryKey: keys.admin.productContent(productId),
    queryFn: ({ signal }) => fetchAdminContent(productId, signal),
    staleTime: FRESH,
  });

// Content shows on the storefront product page, so a save also drops the cached products.
export function useSaveContent(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminProductContentInput) => putAdminContent(productId, input),
    onSuccess: (content) => {
      queryClient.setQueryData(keys.admin.productContent(productId), content);
      void queryClient.invalidateQueries({ queryKey: keys.products.all });
    },
  });
}
