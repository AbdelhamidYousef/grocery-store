import type { AdminBundleCreate, AdminBundleUpdate } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  archiveAdminBundle,
  createAdminBundle,
  fetchAdminBundles,
  fetchBundleVariants,
  updateAdminBundle,
} from '../../../api/admin-bundles';
import { keys } from '../../../lib/query-client';

export const useAdminBundles = () =>
  useQuery({
    queryKey: keys.admin.bundles,
    queryFn: ({ signal }) => fetchAdminBundles(signal),
    staleTime: 0,
  });

export const useBundleVariants = (q: string) =>
  useQuery({
    queryKey: [...keys.admin.bundles, 'variants', q] as const,
    queryFn: ({ signal }) => fetchBundleVariants(q, signal),
    staleTime: 30_000,
  });

// A kit shows on the storefront (its own page, its components' pages), so a write drops those too.
function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.admin.bundles }),
      queryClient.invalidateQueries({ queryKey: keys.products.all }),
    ]);
}

export function useCreateBundle() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: AdminBundleCreate) => createAdminBundle(input),
    onSuccess: refresh,
  });
}
export function useUpdateBundle() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: AdminBundleUpdate }) =>
      updateAdminBundle(variantId, input),
    onSuccess: refresh,
  });
}
export function useArchiveBundle() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (variantId: string) => archiveAdminBundle(variantId),
    onSuccess: refresh,
  });
}
