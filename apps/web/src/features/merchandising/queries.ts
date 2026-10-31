import { useQuery } from '@tanstack/react-query';

import {
  fetchBrand,
  fetchBrands,
  fetchCollection,
  fetchCollections,
} from '../../api/merchandising';
import { keys } from '../../lib/query-client';

// Read hooks for the brand and collection pages (components never fetch themselves).

export function useBrands() {
  return useQuery({ queryKey: keys.brands.all, queryFn: ({ signal }) => fetchBrands(signal) });
}

export function useBrand(slug: string | undefined) {
  return useQuery({
    queryKey: keys.brands.detail(slug ?? ''),
    queryFn: ({ signal }) => fetchBrand(slug ?? '', signal),
    enabled: !!slug,
  });
}

export function useCollections() {
  return useQuery({
    queryKey: keys.collections.all,
    queryFn: ({ signal }) => fetchCollections(signal),
  });
}

export function useCollection(slug: string | undefined) {
  return useQuery({
    queryKey: keys.collections.detail(slug ?? ''),
    queryFn: ({ signal }) => fetchCollection(slug ?? '', signal),
    enabled: !!slug,
  });
}
