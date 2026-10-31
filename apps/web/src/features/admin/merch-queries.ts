import type {
  AdminBrandInput,
  AdminBrandUpdate,
  AdminCollectionInput,
  AdminCollectionUpdate,
  AdminTagInput,
} from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createAdminBrand,
  createAdminCollection,
  createAdminTag,
  deleteAdminBrand,
  deleteAdminCollection,
  deleteAdminTag,
  fetchAdminBrands,
  fetchAdminCollections,
  fetchAdminTags,
  renameAdminTag,
  setAdminCollectionProducts,
  setAdminProductTags,
  updateAdminBrand,
  updateAdminCollection,
} from '../../api/admin-merchandising';
import { keys } from '../../lib/query-client';

// Same rule as the other admin hooks: never trust a cached copy (staleTime 0), and a write marks
// both the admin list and the public caches stale (shoppers refetch when they next look).
const ADMIN_STALE_MS = 0;

export function useAdminBrands() {
  return useQuery({
    queryKey: keys.admin.brands,
    queryFn: ({ signal }) => fetchAdminBrands(signal),
    staleTime: ADMIN_STALE_MS,
  });
}
export function useAdminCollections() {
  return useQuery({
    queryKey: keys.admin.collections,
    queryFn: ({ signal }) => fetchAdminCollections(signal),
    staleTime: ADMIN_STALE_MS,
  });
}
export function useAdminTags() {
  return useQuery({
    queryKey: keys.admin.tags,
    queryFn: ({ signal }) => fetchAdminTags(signal),
    staleTime: ADMIN_STALE_MS,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.admin.all }),
      queryClient.invalidateQueries({ queryKey: keys.brands.all }),
      queryClient.invalidateQueries({ queryKey: keys.collections.all }),
      queryClient.invalidateQueries({ queryKey: keys.products.all }),
    ]);
}

export function useCreateBrand() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: AdminBrandInput) => createAdminBrand(input),
    onSuccess: refresh,
  });
}
export function useUpdateBrand() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminBrandUpdate }) =>
      updateAdminBrand(id, input),
    onSuccess: refresh,
  });
}
export function useDeleteBrand() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: deleteAdminBrand, onSuccess: refresh });
}

export function useCreateCollection() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: AdminCollectionInput) => createAdminCollection(input),
    onSuccess: refresh,
  });
}
export function useUpdateCollection() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminCollectionUpdate }) =>
      updateAdminCollection(id, input),
    onSuccess: refresh,
  });
}
export function useDeleteCollection() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: deleteAdminCollection, onSuccess: refresh });
}
export function useSetCollectionProducts() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, productIds }: { id: string; productIds: string[] }) =>
      setAdminCollectionProducts(id, productIds),
    onSuccess: refresh,
  });
}

export function useCreateTag() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: AdminTagInput) => createAdminTag(input),
    onSuccess: refresh,
  });
}
export function useRenameTag() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameAdminTag(id, name),
    onSuccess: refresh,
  });
}
export function useDeleteTag() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: deleteAdminTag, onSuccess: refresh });
}
export function useSetProductTags(productId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (tagIds: string[]) => setAdminProductTags(productId, tagIds),
    onSuccess: refresh,
  });
}
