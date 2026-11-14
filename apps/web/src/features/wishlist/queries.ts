import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addWishlistItem,
  fetchSharedWishlist,
  fetchWishlist,
  removeWishlistItem,
  setWishlistSharing,
} from '../../api/wishlist';
import { keys } from '../../lib/query-client';
import { track } from '../../lib/track';
import { useAuthOptional } from '../auth/AuthProvider';

// One list per visitor (account or guest cookie). The heart on every product card reads the same
// cached answer, so a page of 24 cards costs one request.
// The key includes who is asking: signing in merges the guest list into the account's, so the
// cached answer of the guest must not be shown to the account (or the other way round).
const useWishlistKey = () => [...keys.wishlist, useAuthOptional().user?.id ?? 'guest'] as const;

export function useWishlist() {
  const queryKey = useWishlistKey();
  return useQuery({ queryKey, queryFn: ({ signal }) => fetchWishlist(signal) });
}

export const useSharedWishlist = (token: string) =>
  useQuery({
    queryKey: keys.sharedWishlist(token),
    queryFn: ({ signal }) => fetchSharedWishlist(token, signal),
    retry: false,
  });

export function useWishlistActions() {
  const queryClient = useQueryClient();
  const queryKey = useWishlistKey();
  const set = (list: Awaited<ReturnType<typeof fetchWishlist>>) =>
    queryClient.setQueryData(queryKey, list);
  const add = useMutation({
    mutationFn: addWishlistItem,
    onSuccess: (list, vars) => {
      set(list);
      track({ name: 'wishlist_add', productId: vars.productId });
    },
  });
  const remove = useMutation({ mutationFn: removeWishlistItem, onSuccess: set });
  const share = useMutation({ mutationFn: setWishlistSharing, onSuccess: set });
  return { add, remove, share };
}
