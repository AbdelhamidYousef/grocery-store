import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  fetchCategories,
  fetchCategory,
  fetchProduct,
  fetchProducts,
  type ProductListParams,
} from '../../api/catalog';
import { fetchProductsByIds, fetchRecommendations } from '../../api/recommendations';
import { keys } from '../../lib/query-client';

// Query hooks: the only way components get catalog data. Each one pairs a cache key from
// `keys` with a function from `api/`, and `signal` lets React Query cancel a request that is no
// longer wanted (the shopper clicked on before it finished).

export function useCategories() {
  return useQuery({
    queryKey: keys.categories.all,
    queryFn: ({ signal }) => fetchCategories(signal),
  });
}

export function useCategory(slug: string | undefined) {
  return useQuery({
    queryKey: keys.categories.detail(slug ?? ''),
    queryFn: ({ signal }) => fetchCategory(slug ?? '', signal),
    enabled: !!slug,
  });
}

export function useProducts(
  params: ProductListParams,
  options: { keepPrevious?: boolean; enabled?: boolean } = {},
) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: keys.products.list(params),
    queryFn: ({ signal }) => fetchProducts(params, signal),
    // While the next page or filter loads, keep showing the last result (dimmed by the caller)
    // instead of flashing a skeleton on every click.
    ...(options.keepPrevious && { placeholderData: keepPreviousData }),
  });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: keys.products.detail(slug ?? ''),
    queryFn: ({ signal }) => fetchProduct(slug ?? '', signal),
    enabled: !!slug,
  });
}

// "Frequently bought together" and "related" for one product.
export function useRecommendations(slug: string | undefined) {
  return useQuery({
    queryKey: keys.products.recommendations(slug ?? ''),
    queryFn: ({ signal }) => fetchRecommendations(slug ?? '', signal),
    enabled: !!slug,
  });
}

// Cards for a list of product ids, in that order (the recently viewed strip).
export function useProductsByIds(ids: readonly string[]) {
  return useQuery({
    queryKey: keys.products.byIds(ids),
    queryFn: ({ signal }) => fetchProductsByIds(ids, signal),
    enabled: ids.length > 0,
  });
}
