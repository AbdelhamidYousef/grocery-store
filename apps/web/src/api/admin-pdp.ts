import { AdminProductContentResponseSchema, type AdminProductContentInput } from '@store/shared';

import { apiFetch } from './client';

// Back-office calls for product-page content.

const id = encodeURIComponent;

export async function fetchAdminContent(productId: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/admin/products/${id(productId)}/content`, {
      schema: AdminProductContentResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function putAdminContent(productId: string, input: AdminProductContentInput) {
  return (
    await apiFetch(`/admin/products/${id(productId)}/content`, {
      method: 'PUT',
      body: input,
      schema: AdminProductContentResponseSchema,
    })
  ).data;
}
