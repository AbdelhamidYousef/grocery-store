import {
  AdminProductContentResponseSchema,
  AdminSizeGuideDeleteResponseSchema,
  AdminSizeGuideListResponseSchema,
  AdminSizeGuideResponseSchema,
  type AdminProductContentInput,
  type AdminSizeGuideInput,
} from '@store/shared';

import { apiFetch } from './client';

// Back-office calls for product-page content and the size guide library.

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

export async function fetchAdminSizeGuides(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/size-guides', {
      schema: AdminSizeGuideListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function createAdminSizeGuide(input: AdminSizeGuideInput) {
  return (
    await apiFetch('/admin/size-guides', {
      method: 'POST',
      body: input,
      schema: AdminSizeGuideResponseSchema,
    })
  ).data;
}

export async function updateAdminSizeGuide(guideId: string, input: AdminSizeGuideInput) {
  return (
    await apiFetch(`/admin/size-guides/${id(guideId)}`, {
      method: 'PATCH',
      body: input,
      schema: AdminSizeGuideResponseSchema,
    })
  ).data;
}

export async function deleteAdminSizeGuide(guideId: string) {
  return (
    await apiFetch(`/admin/size-guides/${id(guideId)}`, {
      method: 'DELETE',
      schema: AdminSizeGuideDeleteResponseSchema,
    })
  ).data;
}
