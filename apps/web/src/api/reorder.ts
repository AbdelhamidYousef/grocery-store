import {
  BuyAgainResponseSchema,
  ReorderResponseSchema,
  type BuyAgainItem,
  type ReorderResult,
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
