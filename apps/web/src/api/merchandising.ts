import {
  BrandListResponseSchema,
  BrandResponseSchema,
  CollectionListResponseSchema,
  CollectionResponseSchema,
  TagListResponseSchema,
} from '@store/shared';

import { apiFetch } from './client';

// Brands, collections and health-need tags: public, cacheable reads (see merchandising router).

export async function fetchBrands(signal?: AbortSignal) {
  return (await apiFetch('/brands', { schema: BrandListResponseSchema, ...(signal && { signal }) }))
    .data;
}

export async function fetchBrand(slug: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/brands/${encodeURIComponent(slug)}`, {
      schema: BrandResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

// Only collections that are live right now come back.
export async function fetchCollections(signal?: AbortSignal) {
  return (
    await apiFetch('/collections', {
      schema: CollectionListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function fetchCollection(slug: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/collections/${encodeURIComponent(slug)}`, {
      schema: CollectionResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function fetchTags(signal?: AbortSignal) {
  return (await apiFetch('/tags', { schema: TagListResponseSchema, ...(signal && { signal }) }))
    .data;
}
