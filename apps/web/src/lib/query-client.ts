import { QueryClient } from '@tanstack/react-query';

import type { AdminProductListParams } from '../api/admin';
import type { ProductListParams } from '../api/catalog';
import { ApiError } from '../api/client';

// Catalog data changes rarely and the API itself caches for 60 s (see the catalog notes in the
// API contract), so the browser treats it as fresh for the same minute: going back to a list does
// not refetch, and after a minute it shows the cached page instantly while it revalidates
// (stale-while-revalidate).
export const CATALOG_STALE_MS = 60_000;

// Retrying a 4xx is pointless (the same request will fail the same way); a 5xx or a dropped
// connection may be a blip, so those get two more tries.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return error instanceof ApiError && (error.status >= 500 || error.code === 'NETWORK');
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: CATALOG_STALE_MS, retry: shouldRetry, refetchOnWindowFocus: false },
    },
  });
}

// Query keys are the cache identity: two components asking for the same key share one request and
// one cache entry, and invalidating a prefix (['products']) refreshes everything below it.
// Defined once here so no component spells a key by hand and typos cannot create a second cache.
export const keys = {
  // Signed-in user (or null). Written directly on login/logout, so it never needs a refetch.
  me: ['me'] as const,
  cart: ['cart'] as const,
  // Warnings the cart reported, kept until dismissed (see features/cart/queries.ts).
  cartNotices: ['cart-notices'] as const,
  // Quotes depend on the cart's subtotal and weight as well as the country.
  shipping: (country: string, subtotalCents: number, weightGrams: number) =>
    ['shipping', country, subtotalCents, weightGrams] as const,
  order: {
    status: (number: string) => ['order', number, 'status'] as const,
    detail: (number: string) => ['order', number] as const,
  },
  account: {
    all: ['account'] as const,
    addresses: ['account', 'addresses'] as const,
    // Everything below shares this prefix, so one invalidation refreshes the list and any detail.
    orders: ['account', 'orders'] as const,
    orderList: (page: number) => ['account', 'orders', 'list', page] as const,
    order: (number: string) => ['account', 'orders', 'detail', number] as const,
  },
  // Back office data. Its own root so logging out can drop it in one call, and so the storefront
  // caches are never touched by an admin edit by accident.
  admin: {
    all: ['admin'] as const,
    stats: ['admin', 'stats'] as const,
    products: ['admin', 'products'] as const,
    productList: (params: AdminProductListParams) => ['admin', 'products', 'list', params] as const,
    product: (id: string) => ['admin', 'products', 'detail', id] as const,
  },
  categories: {
    all: ['categories'] as const,
    detail: (slug: string) => ['categories', slug] as const,
  },
  products: {
    all: ['products'] as const,
    list: (params: ProductListParams) => ['products', 'list', params] as const,
    detail: (slug: string) => ['products', 'detail', slug] as const,
  },
};
