import type { AdminInventorySet, AdminVariantInput, AdminVariantUpdate } from '@store/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addAdminVariant,
  createAdminProduct,
  deleteAdminVariant,
  fetchAdminProduct,
  fetchAdminProducts,
  fetchAdminStats,
  setAdminInventory,
  updateAdminProduct,
  updateAdminVariant,
  type AdminProductListParams,
} from '../../api/admin';
import { keys } from '../../lib/query-client';

// Back office numbers must be what the database says now, not what it said a minute ago (the
// storefront default), so admin queries are never "fresh": revisiting a screen refetches while
// still showing the cached copy instantly.
const ADMIN_STALE_MS = 0;

export function useAdminStats() {
  return useQuery({
    queryKey: keys.admin.stats,
    queryFn: ({ signal }) => fetchAdminStats(signal),
    staleTime: ADMIN_STALE_MS,
  });
}

export function useAdminProducts(params: AdminProductListParams) {
  return useQuery({
    queryKey: keys.admin.productList(params),
    queryFn: ({ signal }) => fetchAdminProducts(params, signal),
    staleTime: ADMIN_STALE_MS,
    // Keep the old rows on screen while the next page or filter loads.
    placeholderData: keepPreviousData,
  });
}

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: keys.admin.product(id ?? ''),
    queryFn: ({ signal }) => fetchAdminProduct(id ?? '', signal),
    enabled: !!id,
    staleTime: ADMIN_STALE_MS,
  });
}

// Any product, variant or stock write can change a list row (price range, stock), the dashboard's
// low-stock count and what shoppers see, so one helper refreshes all three families. The storefront
// caches are only marked stale (shoppers refetch when they next look), never read here.
function useRefreshAfterWrite() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.admin.products }),
      queryClient.invalidateQueries({ queryKey: keys.admin.stats }),
      queryClient.invalidateQueries({ queryKey: keys.products.all }),
    ]);
}

export function useCreateAdminProduct() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: createAdminProduct, onSuccess: refresh });
}

export function useUpdateAdminProduct(id: string) {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateAdminProduct>[1]) => updateAdminProduct(id, input),
    onSuccess: refresh,
  });
}

export function useAddAdminVariant(productId: string) {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: (input: AdminVariantInput) => addAdminVariant(productId, input),
    onSuccess: refresh,
  });
}

export function useUpdateAdminVariant() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminVariantUpdate }) =>
      updateAdminVariant(id, input),
    onSuccess: refresh,
  });
}

export function useDeleteAdminVariant() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: deleteAdminVariant, onSuccess: refresh });
}

export function useSetAdminInventory() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: AdminInventorySet }) =>
      setAdminInventory(variantId, input),
    onSuccess: refresh,
  });
}
