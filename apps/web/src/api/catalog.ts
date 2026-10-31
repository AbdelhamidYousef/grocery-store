import {
  CategoryResponseSchema,
  CategoryTreeResponseSchema,
  ProductDetailResponseSchema,
  ProductListResponseSchema,
  type ProductSort,
} from '@store/shared';

import { apiFetch } from './client';

// The list parameters as the web holds them (parsed from the URL by useProductListParams).
export interface ProductListParams {
  category?: string | undefined;
  q?: string | undefined;
  sort?: ProductSort | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  inStock?: boolean | undefined;
  /** Brand slugs, sent as `brand=a,b`. */
  brand?: string[] | undefined;
  /** Health-need tag slugs, sent as `tag=a,b`. */
  tag?: string[] | undefined;
  /** Collection slug (set by the collection page, not by the filter UI). */
  collection?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  /** attribute key -> selected values, sent as `attr.<key>=a,b`. */
  attr?: Record<string, string[]> | undefined;
}

export function toListSearch(params: ProductListParams): string {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.q) search.set('q', params.q);
  if (params.sort) search.set('sort', params.sort);
  if (params.minPrice !== undefined) search.set('minPrice', String(params.minPrice));
  if (params.maxPrice !== undefined) search.set('maxPrice', String(params.maxPrice));
  if (params.inStock) search.set('inStock', 'true');
  if (params.brand?.length) search.set('brand', params.brand.join(','));
  if (params.tag?.length) search.set('tag', params.tag.join(','));
  if (params.collection) search.set('collection', params.collection);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  for (const [key, values] of Object.entries(params.attr ?? {})) {
    if (values.length > 0) search.set(`attr.${key}`, values.join(','));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export async function fetchCategories(signal?: AbortSignal) {
  return (
    await apiFetch('/categories', { schema: CategoryTreeResponseSchema, ...(signal && { signal }) })
  ).data;
}

export async function fetchCategory(slug: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/categories/${encodeURIComponent(slug)}`, {
      schema: CategoryResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

// Returns the whole envelope: the PLP needs data, meta (pagination) and facets together.
export function fetchProducts(params: ProductListParams, signal?: AbortSignal) {
  return apiFetch(`/products${toListSearch(params)}`, {
    schema: ProductListResponseSchema,
    ...(signal && { signal }),
  });
}

export async function fetchProduct(slug: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/products/${encodeURIComponent(slug)}`, {
      schema: ProductDetailResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
