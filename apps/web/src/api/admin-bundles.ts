import {
  AdminBundleDeleteResponseSchema,
  AdminBundleListResponseSchema,
  AdminBundleResponseSchema,
  AdminBundleVariantsResponseSchema,
  type AdminBundleCreate,
  type AdminBundleUpdate,
} from '@store/shared';

import { apiFetch } from './client';

// Back-office calls for kits (bundles). A kit is addressed by its variant id.

const id = encodeURIComponent;

export async function fetchAdminBundles(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/bundles', {
      schema: AdminBundleListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function fetchBundleVariants(q: string, signal?: AbortSignal) {
  const query = q.trim() ? `?q=${id(q.trim())}` : '';
  return (
    await apiFetch(`/admin/bundles/variants${query}`, {
      schema: AdminBundleVariantsResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function createAdminBundle(input: AdminBundleCreate) {
  return (
    await apiFetch('/admin/bundles', {
      method: 'POST',
      body: input,
      schema: AdminBundleResponseSchema,
    })
  ).data;
}

export async function updateAdminBundle(variantId: string, input: AdminBundleUpdate) {
  return (
    await apiFetch(`/admin/bundles/${id(variantId)}`, {
      method: 'PATCH',
      body: input,
      schema: AdminBundleResponseSchema,
    })
  ).data;
}

export async function archiveAdminBundle(variantId: string) {
  return (
    await apiFetch(`/admin/bundles/${id(variantId)}`, {
      method: 'DELETE',
      schema: AdminBundleDeleteResponseSchema,
    })
  ).data;
}
