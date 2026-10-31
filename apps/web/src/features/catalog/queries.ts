import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  fetchCategories,
  fetchCategory,
  fetchProduct,
  fetchProducts,
  type ProductListParams,
} from '../../api/catalog';
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

export function useProducts(params: ProductListParams, options: { keepPrevious?: boolean } = {}) {
  return useQuery({
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
