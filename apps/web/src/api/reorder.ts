import {
  BuyAgainResponseSchema,
  ReorderResponseSchema,
  UsualsResponseSchema,
  type BuyAgainItem,
  type ReorderResult,
  type Usuals,
} from '@store/shared';

import { apiFetch } from './client';

export async function fetchBuyAgain(signal?: AbortSignal): Promise<BuyAgainItem[]> {
  return (
    await apiFetch('/me/buy-again', {
      schema: BuyAgainResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function reorderOrder(orderRef: string): Promise<ReorderResult> {
  return (
    await apiFetch(`/me/orders/${encodeURIComponent(orderRef)}/reorder`, {
      method: 'POST',
      schema: ReorderResponseSchema,
    })
  ).data;
}

export async function fetchUsuals(signal?: AbortSignal): Promise<Usuals> {
  return (await apiFetch('/me/usuals', { schema: UsualsResponseSchema, ...(signal && { signal }) }))
    .data;
}
