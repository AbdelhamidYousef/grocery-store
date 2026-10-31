import type { AddressUpdateInput } from '@store/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  changePassword,
  createAddress,
  deleteAddress,
  fetchAddresses,
  fetchOrder,
  fetchOrders,
  updateAddress,
  updateProfile,
} from '../../api/account';
import { ApiError } from '../../api/client';
import { keys } from '../../lib/query-client';

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    // The response is the fresh user: put it in the ['me'] cache so the header name updates.
    onSuccess: (user) => queryClient.setQueryData(keys.me, user),
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}

export function useAddresses({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.account.addresses,
    queryFn: ({ signal }) => fetchAddresses(signal),
    enabled,
  });
}

// Making one address the default demotes another on the server, so every address write
// invalidates the whole list instead of patching one row in the cache.
function useAddressMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.account.addresses }),
  });
}

export const useCreateAddress = () => useAddressMutation(createAddress);
export const useUpdateAddress = () =>
  useAddressMutation(({ id, input }: { id: string; input: AddressUpdateInput }) =>
    updateAddress(id, input),
  );
export const useDeleteAddress = () => useAddressMutation(deleteAddress);

export function useOrders(page: number) {
  return useQuery({
    queryKey: keys.account.orderList(page),
    queryFn: ({ signal }) => fetchOrders(page, signal),
    // Stay on the previous page's rows while the next page loads, so paging does not flash a
    // skeleton.
    placeholderData: keepPreviousData,
  });
}

export function useOrder(number: string) {
  return useQuery({
    queryKey: keys.account.order(number),
    queryFn: ({ signal }) => fetchOrder(number, signal),
    // 404 means "not your order" (or no such order): retrying cannot change that.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}
