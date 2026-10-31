import {
  AddressListResponseSchema,
  AddressResponseSchema,
  OrderListResponseSchema,
  ProfileResponseSchema,
  type Address,
  type AddressInput,
  type AddressUpdateInput,
  type ChangePasswordInput,
  type UpdateProfileInput,
  type User,
} from '@store/shared';

import { NoContentSchema } from './auth';
import { apiFetch } from './client';

export async function updateProfile(input: UpdateProfileInput): Promise<User> {
  const res = await apiFetch('/account', {
    method: 'PATCH',
    body: input,
    schema: ProfileResponseSchema,
  });
  return res.data.user;
}

// 204 on success. A wrong current password is a 400 with fieldErrors.currentPassword (not a 401,
// which the web would read as an expired session).
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await apiFetch('/account/password', { method: 'POST', body: input, schema: NoContentSchema });
}

export async function fetchAddresses(signal?: AbortSignal): Promise<Address[]> {
  return (
    await apiFetch('/account/addresses', {
      schema: AddressListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function createAddress(input: AddressInput): Promise<Address> {
  return (
    await apiFetch('/account/addresses', {
      method: 'POST',
      body: input,
      schema: AddressResponseSchema,
    })
  ).data;
}

export async function updateAddress(id: string, input: AddressUpdateInput): Promise<Address> {
  return (
    await apiFetch(`/account/addresses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
      schema: AddressResponseSchema,
    })
  ).data;
}

export async function deleteAddress(id: string): Promise<void> {
  await apiFetch(`/account/addresses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    schema: NoContentSchema,
  });
}

export function fetchOrders(signal?: AbortSignal) {
  return apiFetch('/account/orders', {
    schema: OrderListResponseSchema,
    ...(signal && { signal }),
  });
}
