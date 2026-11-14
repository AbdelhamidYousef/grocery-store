import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import type { AdminOrderListParams, AdminProductListParams } from '../api/admin';
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

// A 401 for someone the page believes is signed in means the session ended behind the page's back
// (it expired, or was revoked by a password change on another device). The cached user is stale,
// so drop it: the header turns back into "Sign in", guarded pages send the visitor to the login
// form with a way back, and checkout (open to guests) carries on as a guest. The flag lets those
// places say WHY. The cart is untouched: it lives in its own cookie, not in the session.
// Only when `me` holds a user: a wrong password at the login form is also a 401, and that is just
// a failed attempt.
export function handleUnauthenticated(client: QueryClient, error: unknown): void {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  if (!client.getQueryData(keys.me)) return;
  client.setQueryData(keys.me, null);
  client.setQueryData(keys.sessionExpired, true);
  // Whoever signs in next may be someone else: do not show them this account's cached data. Deferred
  // so the failing query finishes its own error handling first.
  setTimeout(() => {
    client.removeQueries({ queryKey: keys.account.all });
    client.removeQueries({ queryKey: keys.admin.all });
  }, 0);
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => handleUnauthenticated(client, error) }),
    mutationCache: new MutationCache({ onError: (error) => handleUnauthenticated(client, error) }),
    defaultOptions: {
      queries: { staleTime: CATALOG_STALE_MS, retry: shouldRetry, refetchOnWindowFocus: false },
    },
  });
  return client;
}

// Query keys are the cache identity: two components asking for the same key share one request and
// one cache entry, and invalidating a prefix (['products']) refreshes everything below it.
// Defined once here so no component spells a key by hand and typos cannot create a second cache.
export const keys = {
  // Signed-in user (or null). Written directly on login/logout, so it never needs a refetch.
  me: ['me'] as const,
  cart: ['cart'] as const,
  // Loyalty balance, tier and ledger of the signed-in shopper.
  points: ['points'] as const,
  rewards: ['rewards'] as const,
  referral: ['points', 'referral'] as const,
  wishlist: ['wishlist'] as const,
  buyAgain: ['buy-again'] as const,
  sharedWishlist: (token: string) => ['wishlist', 'shared', token] as const,
  charityTotal: ['charity', 'total'] as const,
  myCodes: ['points', 'codes'] as const,
  adminRewards: ['admin', 'rewards'] as const,
  // The API's own health check, polled by the "server unreachable" banner.
  health: ['health'] as const,
  // The site-wide flash-sale banner (active or next scheduled sale, plus the server's clock).
  saleBanner: ['promotions', 'banner'] as const,
  // Transit days of the shipping methods and the server clock, for the delivery estimate.
  deliveryMethods: ['delivery-methods'] as const,
  // True once a request came back 401 while the shopper looked signed in (see createQueryClient).
  sessionExpired: ['session-expired'] as const,
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
    pets: ['account', 'pets'] as const,
    // Everything below shares this prefix, so one invalidation refreshes the list and any detail.
    orders: ['account', 'orders'] as const,
    orderList: (page: number) => ['account', 'orders', 'list', page] as const,
    order: (number: string) => ['account', 'orders', 'detail', number] as const,
    returns: (number: string) => ['account', 'orders', 'returns', number] as const,
  },
  // Back office data. Its own root so logging out can drop it in one call, and so the storefront
  // caches are never touched by an admin edit by accident.
  admin: {
    all: ['admin'] as const,
    stats: ['admin', 'stats'] as const,
    products: ['admin', 'products'] as const,
    productList: (params: AdminProductListParams) => ['admin', 'products', 'list', params] as const,
    product: (id: string) => ['admin', 'products', 'detail', id] as const,
    // Product-page content and the size guide library (phase 16).
    productContent: (id: string) => ['admin', 'product-content', id] as const,
    sizeGuides: ['admin', 'size-guides'] as const,
    bundles: ['admin', 'bundles'] as const,
    brands: ['admin', 'brands'] as const,
    collections: ['admin', 'collections'] as const,
    tags: ['admin', 'tags'] as const,
    menuPromos: ['admin', 'menu-promos'] as const,
    reviews: (status: string) => ['admin', 'reviews', status] as const,
    vetAll: ['admin', 'vet-approvals'] as const,
    vet: (decision: string, page: number) => ['admin', 'vet-approvals', decision, page] as const,
    analytics: (from: string, to: string, interval: string, currency = 'EUR') =>
      ['admin', 'analytics', from, to, interval, currency] as const,
    returns: ['admin', 'returns'] as const,
    returnList: (status: string, page: number) =>
      ['admin', 'returns', 'list', status, page] as const,
    return: (id: string) => ['admin', 'returns', 'detail', id] as const,
    orders: ['admin', 'orders'] as const,
    orderList: (params: AdminOrderListParams) => ['admin', 'orders', 'list', params] as const,
    order: (number: string) => ['admin', 'orders', 'detail', number] as const,
    promotions: {
      codes: ['admin', 'promotions', 'codes'] as const,
      tiers: ['admin', 'promotions', 'tiers'] as const,
      gift: ['admin', 'promotions', 'gift'] as const,
      flashSales: ['admin', 'promotions', 'flash-sales'] as const,
      variant: (sku: string) => ['admin', 'promotions', 'variant', sku] as const,
    },
    // Content management (guides, help, testimonials, safety notices, withdrawals, messages).
    content: {
      guides: ['admin', 'content', 'guides'] as const,
      guide: (id: string) => ['admin', 'content', 'guides', id] as const,
      help: ['admin', 'content', 'help'] as const,
      testimonials: ['admin', 'content', 'testimonials'] as const,
      safety: ['admin', 'content', 'safety'] as const,
      safetyNotice: (id: string) => ['admin', 'content', 'safety', id] as const,
      withdrawals: ['admin', 'content', 'withdrawals'] as const,
      messages: ['admin', 'content', 'messages'] as const,
      home: ['admin', 'content', 'home'] as const,
    },
  },
  safety: { active: ['safety', 'active'] as const },
  home: { all: ['home'] as const, testimonials: ['home', 'testimonials'] as const },
  help: {
    all: ['help'] as const,
    search: (params: { q?: string | undefined; topic?: string | undefined }) =>
      ['help', 'search', params] as const,
  },
  guides: {
    all: ['guides'] as const,
    categories: ['guides', 'categories'] as const,
    list: (params: { category?: string | undefined; page?: number | undefined }) =>
      ['guides', 'list', params] as const,
    detail: (slug: string) => ['guides', 'detail', slug] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    list: (slug: string, params: object) => ['reviews', 'list', slug, params] as const,
  },
  // The mega-menu data (pets, categories, brands, promos): one cached call.
  navigation: ['navigation'] as const,
  categories: {
    all: ['categories'] as const,
    detail: (slug: string) => ['categories', slug] as const,
  },
  brands: {
    all: ['brands'] as const,
    detail: (slug: string) => ['brands', slug] as const,
  },
  collections: {
    all: ['collections'] as const,
    detail: (slug: string) => ['collections', slug] as const,
  },
  products: {
    all: ['products'] as const,
    list: (params: ProductListParams) => ['products', 'list', params] as const,
    detail: (slug: string) => ['products', 'detail', slug] as const,
    recommendations: (slug: string) => ['products', 'recommendations', slug] as const,
    byIds: (ids: readonly string[]) => ['products', 'by-ids', ...ids] as const,
  },
};
