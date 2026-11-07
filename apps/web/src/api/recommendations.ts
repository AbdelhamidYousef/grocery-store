import {
  BulkAddFailureSchema,
  ByIdsResponseSchema,
  RecommendationsResponseSchema,
  type BulkAddCartItemsInput,
  type BulkAddFailure,
} from '@store/shared';
import { z } from 'zod';

import type { WebCart } from './cart';
import { CartResponse } from './cart';
import { ApiError, apiFetch } from './client';

export async function fetchRecommendations(slug: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/products/${encodeURIComponent(slug)}/recommendations`, {
      schema: RecommendationsResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

// Ids stay in the order the caller gave (the strip shows the newest view first).
export async function fetchProductsByIds(ids: readonly string[], signal?: AbortSignal) {
  return (
    await apiFetch(`/products/by-ids?ids=${ids.map(encodeURIComponent).join(',')}`, {
      schema: ByIdsResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function bulkAddCartItems(input: BulkAddCartItemsInput): Promise<WebCart> {
  return (await apiFetch('/cart/items/bulk', { method: 'POST', body: input, schema: CartResponse }))
    .data;
}

// What a refused bulk add says line by line, or [] when the error is something else.
export function bulkFailures(error: unknown): BulkAddFailure[] {
  if (!(error instanceof ApiError)) return [];
  const parsed = z.object({ failures: z.array(BulkAddFailureSchema) }).safeParse(error.details);
  return parsed.success ? parsed.data.failures : [];
}
