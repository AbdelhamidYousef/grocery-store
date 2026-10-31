import {
  AdminCollectionListResponseSchema,
  AdminCollectionResponseSchema,
  BrandListResponseSchema,
  BrandResponseSchema,
  DataSchema,
  TagListResponseSchema,
  TagSchema,
  type AdminBrandInput,
  type AdminBrandUpdate,
  type AdminCollectionInput,
  type AdminCollectionUpdate,
  type AdminTagInput,
} from '@store/shared';
import { z } from 'zod';

import { NoContentSchema } from './auth';
import { apiFetch } from './client';

// Back-office calls for brands, collections and tags (the API answers 401/403 to non-admins).

const id = encodeURIComponent;
const TagResponseSchema = DataSchema(TagSchema);
const ProductTagsResponseSchema = DataSchema(
  z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
);

// ----- brands -----
export async function fetchAdminBrands(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/brands', {
      schema: BrandListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function createAdminBrand(input: AdminBrandInput) {
  return (
    await apiFetch('/admin/brands', {
      method: 'POST',
      body: input,
      schema: BrandResponseSchema,
    })
  ).data;
}
export async function updateAdminBrand(brandId: string, input: AdminBrandUpdate) {
  return (
    await apiFetch(`/admin/brands/${id(brandId)}`, {
      method: 'PATCH',
      body: input,
      schema: BrandResponseSchema,
    })
  ).data;
}
export async function deleteAdminBrand(brandId: string): Promise<void> {
  await apiFetch(`/admin/brands/${id(brandId)}`, { method: 'DELETE', schema: NoContentSchema });
}

// ----- collections -----
export async function fetchAdminCollections(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/collections', {
      schema: AdminCollectionListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function createAdminCollection(input: AdminCollectionInput) {
  return (
    await apiFetch('/admin/collections', {
      method: 'POST',
      body: input,
      schema: AdminCollectionResponseSchema,
    })
  ).data;
}
export async function updateAdminCollection(collectionId: string, input: AdminCollectionUpdate) {
  return (
    await apiFetch(`/admin/collections/${id(collectionId)}`, {
      method: 'PATCH',
      body: input,
      schema: AdminCollectionResponseSchema,
    })
  ).data;
}
export async function deleteAdminCollection(collectionId: string): Promise<void> {
  await apiFetch(`/admin/collections/${id(collectionId)}`, {
    method: 'DELETE',
    schema: NoContentSchema,
  });
}
// The whole ordered list replaces the old one.
export async function setAdminCollectionProducts(collectionId: string, productIds: string[]) {
  return (
    await apiFetch(`/admin/collections/${id(collectionId)}/products`, {
      method: 'PUT',
      body: { productIds },
      schema: AdminCollectionResponseSchema,
    })
  ).data;
}

// ----- tags -----
export async function fetchAdminTags(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/tags', { schema: TagListResponseSchema, ...(signal && { signal }) })
  ).data;
}
export async function createAdminTag(input: AdminTagInput) {
  return (await apiFetch('/admin/tags', { method: 'POST', body: input, schema: TagResponseSchema }))
    .data;
}
export async function renameAdminTag(tagId: string, name: string) {
  return (
    await apiFetch(`/admin/tags/${id(tagId)}`, {
      method: 'PATCH',
      body: { name },
      schema: TagResponseSchema,
    })
  ).data;
}
export async function deleteAdminTag(tagId: string): Promise<void> {
  await apiFetch(`/admin/tags/${id(tagId)}`, { method: 'DELETE', schema: NoContentSchema });
}
export async function setAdminProductTags(productId: string, tagIds: string[]) {
  return (
    await apiFetch(`/admin/products/${id(productId)}/tags`, {
      method: 'PUT',
      body: { tagIds },
      schema: ProductTagsResponseSchema,
    })
  ).data;
}
