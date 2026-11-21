import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addListToCart,
  createList,
  deleteList,
  fetchList,
  fetchLists,
  putListItem,
  removeListItem,
  renameList,
  setListItemQuantity,
} from '../../api/lists';
import { keys } from '../../lib/query-client';
import { useAuthOptional } from '../auth/AuthProvider';

// The shopper's lists (names and counts) and one list in full. A list's items carry the price and the
// stock of the shopper's store, so the key root is not an "unscoped" one: a new postcode refetches it.
export function useLists() {
  const { user } = useAuthOptional();
  return useQuery({
    queryKey: keys.lists,
    queryFn: ({ signal }) => fetchLists(signal),
    enabled: user !== null,
  });
}

export function useList(id: string | null) {
  return useQuery({
    queryKey: keys.list(id ?? ''),
    queryFn: ({ signal }) => fetchList(id ?? '', signal),
    enabled: id !== null,
  });
}

export function useListActions() {
  const queryClient = useQueryClient();
  const refreshLists = () => queryClient.invalidateQueries({ queryKey: keys.lists });
  const setDetail = (list: Awaited<ReturnType<typeof fetchList>>) => {
    queryClient.setQueryData(keys.list(list.id), list);
    void refreshLists();
  };
  return {
    create: useMutation({ mutationFn: createList, onSuccess: refreshLists }),
    rename: useMutation({
      mutationFn: (v: { id: string; name: string }) => renameList(v.id, v.name),
      onSuccess: (_s, v) => {
        void queryClient.invalidateQueries({ queryKey: keys.list(v.id) });
        void refreshLists();
      },
    }),
    remove: useMutation({ mutationFn: deleteList, onSuccess: refreshLists }),
    put: useMutation({
      mutationFn: (v: { id: string; productId: string; variantId?: string; quantity?: number }) =>
        putListItem(v.id, {
          productId: v.productId,
          ...(v.variantId && { variantId: v.variantId }),
          quantity: v.quantity ?? 1,
        }),
      onSuccess: setDetail,
    }),
    setQuantity: useMutation({
      mutationFn: (v: { id: string; itemId: string; quantity: number }) =>
        setListItemQuantity(v.id, v.itemId, v.quantity),
      onSuccess: setDetail,
    }),
    removeItem: useMutation({
      mutationFn: (v: { id: string; itemId: string }) => removeListItem(v.id, v.itemId),
      onSuccess: setDetail,
    }),
    // The server put lines in the cart: refetch it instead of patching.
    addToCart: useMutation({
      mutationFn: addListToCart,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.cart }),
    }),
  };
}
