import type { AdminProductContentInput, AdminSizeGuideInput } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createAdminSizeGuide,
  deleteAdminSizeGuide,
  fetchAdminContent,
  fetchAdminSizeGuides,
  putAdminContent,
  updateAdminSizeGuide,
} from '../../../api/admin-pdp';
import { keys } from '../../../lib/query-client';

// Never "fresh", like the other admin hooks.
const FRESH = 0;

export const useAdminContent = (productId: string) =>
  useQuery({
    queryKey: keys.admin.productContent(productId),
    queryFn: ({ signal }) => fetchAdminContent(productId, signal),
    staleTime: FRESH,
  });

export const useAdminSizeGuides = () =>
  useQuery({
    queryKey: keys.admin.sizeGuides,
    queryFn: ({ signal }) => fetchAdminSizeGuides(signal),
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
      void queryClient.invalidateQueries({ queryKey: keys.admin.sizeGuides });
    },
  });
}

function useRefreshGuides() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.admin.sizeGuides }),
      queryClient.invalidateQueries({ queryKey: keys.products.all }),
    ]);
}

export function useCreateSizeGuide() {
  const refresh = useRefreshGuides();
  return useMutation({
    mutationFn: (input: AdminSizeGuideInput) => createAdminSizeGuide(input),
    onSuccess: refresh,
  });
}
export function useUpdateSizeGuide() {
  const refresh = useRefreshGuides();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminSizeGuideInput }) =>
      updateAdminSizeGuide(id, input),
    onSuccess: refresh,
  });
}
export function useDeleteSizeGuide() {
  const refresh = useRefreshGuides();
  return useMutation({ mutationFn: (id: string) => deleteAdminSizeGuide(id), onSuccess: refresh });
}
