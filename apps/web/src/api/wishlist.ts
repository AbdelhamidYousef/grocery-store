import {
  SharedWishlistResponseSchema,
  WishlistResponseSchema,
  type SharedWishlist,
  type Wishlist,
  type WishlistAdd,
} from '@store/shared';

import { apiFetch } from './client';

export async function fetchWishlist(signal?: AbortSignal): Promise<Wishlist> {
  return (
    await apiFetch('/wishlist', { schema: WishlistResponseSchema, ...(signal && { signal }) })
  ).data;
}

export async function addWishlistItem(body: WishlistAdd): Promise<Wishlist> {
  return (
    await apiFetch('/wishlist/items', { method: 'POST', body, schema: WishlistResponseSchema })
  ).data;
}

export async function removeWishlistItem(id: string): Promise<Wishlist> {
  return (
    await apiFetch(`/wishlist/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      schema: WishlistResponseSchema,
    })
  ).data;
}

export async function setWishlistSharing(on: boolean): Promise<Wishlist> {
  return (
    await apiFetch('/wishlist/share', {
      method: on ? 'POST' : 'DELETE',
      schema: WishlistResponseSchema,
    })
  ).data;
}

export async function fetchSharedWishlist(
  token: string,
  signal?: AbortSignal,
): Promise<SharedWishlist> {
  return (
    await apiFetch(`/wishlist/shared/${encodeURIComponent(token)}`, {
      schema: SharedWishlistResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
