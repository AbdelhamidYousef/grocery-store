import type { AddressUpdateInput } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  changePassword,
  createAddress,
  deleteAddress,
  fetchAddresses,
  fetchOrders,
  updateAddress,
  updateProfile,
} from '../../api/account';
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

export function useAddresses() {
  return useQuery({
    queryKey: keys.account.addresses,
    queryFn: ({ signal }) => fetchAddresses(signal),
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

export function useOrders() {
  return useQuery({ queryKey: keys.account.orders, queryFn: ({ signal }) => fetchOrders(signal) });
}
