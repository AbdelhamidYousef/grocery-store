import type {
  AdminInventorySet,
  AdminTransition,
  AdminVariantInput,
  AdminVariantPricesInput,
  AdminVariantUpdate,
} from '@store/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addAdminVariant,
  createAdminProduct,
  deleteAdminVariant,
  fetchAdminOrder,
  fetchAdminOrders,
  fetchAdminProduct,
  fetchAdminProducts,
  fetchAdminVariantPrices,
  fetchAdminStats,
  setAdminInventory,
  setAdminVariantPrices,
  transitionAdminOrder,
  updateAdminProduct,
  updateAdminVariant,
  type AdminOrderListParams,
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
      // A new or removed variant changes the constituents rows of the content editor.
      queryClient.invalidateQueries({ queryKey: ['admin', 'product-content'] }),
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

export function useAdminVariantPrices(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'variant-prices', id],
    queryFn: ({ signal }) => fetchAdminVariantPrices(id ?? '', signal),
    enabled: id !== undefined,
    staleTime: ADMIN_STALE_MS,
  });
}

export function useSetAdminVariantPrices(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminVariantPricesInput) => setAdminVariantPrices(id, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'variant-prices', id] }),
  });
}

export function useSetAdminInventory() {
  const refresh = useRefreshAfterWrite();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: AdminInventorySet }) =>
      setAdminInventory(variantId, input),
    onSuccess: refresh,
  });
}

// ---------- orders ----------

export function useAdminOrders(params: AdminOrderListParams) {
  return useQuery({
    queryKey: keys.admin.orderList(params),
    queryFn: ({ signal }) => fetchAdminOrders(params, signal),
    staleTime: ADMIN_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrder(number: string | undefined) {
  return useQuery({
    queryKey: keys.admin.order(number ?? ''),
    queryFn: ({ signal }) => fetchAdminOrder(number ?? '', signal),
    enabled: !!number,
    staleTime: ADMIN_STALE_MS,
  });
}

export function useTransitionAdminOrder(number: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminTransition) => transitionAdminOrder(number, input),
    onSuccess: (detail) => {
      // The answer IS the fresh detail (with the new allowed moves): write it straight in so the
      // buttons change at once, then refresh what else shows this order's status or revenue.
      queryClient.setQueryData(keys.admin.order(number), detail);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.admin.orders, exact: false }),
        queryClient.invalidateQueries({ queryKey: keys.admin.stats }),
        queryClient.invalidateQueries({ queryKey: keys.account.orders }),
        // A cancel or refund restocks, which changes what the product screens show.
        queryClient.invalidateQueries({ queryKey: keys.admin.products }),
      ]);
    },
    // A 409 means the order moved under us (a webhook, another admin): re-read it, so the buttons
    // shown next are the real ones.
    onError: () => queryClient.invalidateQueries({ queryKey: keys.admin.order(number) }),
  });
}
