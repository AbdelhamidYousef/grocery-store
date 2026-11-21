import {
  AdminOrderDetailResponseSchema,
  AdminShortfallResponseSchema,
  PickingResponseSchema,
  PickLineResponseSchema,
  PickStoresResponseSchema,
  SubstitutesResponseSchema,
  type AdminShortfallInput,
  type PickingResult,
  type PickLineAction,
  type SubstituteOption,
} from '@store/shared';

import { apiFetch } from './client';

// The packer's calls (admin only; the API answers 401/403 to anyone else).

export async function fetchPickStores(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/stores', {
      schema: PickStoresResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function fetchPicking(
  slug: string,
  window: 'next' | 'all',
  order?: string,
  signal?: AbortSignal,
): Promise<PickingResult> {
  const find = order ? `&order=${encodeURIComponent(order)}` : '';
  return (
    await apiFetch(`/admin/stores/${encodeURIComponent(slug)}/picking?window=${window}${find}`, {
      schema: PickingResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

const linePath = (number: string, itemId: string) =>
  `/admin/orders/${encodeURIComponent(number)}/items/${encodeURIComponent(itemId)}`;

export async function markPickLine(number: string, itemId: string, input: PickLineAction) {
  return (
    await apiFetch(`${linePath(number, itemId)}/pick`, {
      method: 'POST',
      body: input,
      schema: PickLineResponseSchema,
    })
  ).data;
}

export async function recordLineShortfall(
  number: string,
  itemId: string,
  input: AdminShortfallInput,
) {
  return (
    await apiFetch(`${linePath(number, itemId)}/shortfall`, {
      method: 'POST',
      body: input,
      schema: AdminShortfallResponseSchema,
    })
  ).data;
}

export async function fetchLineSubstitutes(
  number: string,
  itemId: string,
  signal?: AbortSignal,
): Promise<SubstituteOption[]> {
  return (
    await apiFetch(`${linePath(number, itemId)}/substitutes`, {
      schema: SubstitutesResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

// "Bag packed" and "Hand to rider": both answer with the fresh order detail.
export async function packOrder(number: string) {
  return (
    await apiFetch(`/admin/orders/${encodeURIComponent(number)}/pack`, {
      method: 'POST',
      schema: AdminOrderDetailResponseSchema,
    })
  ).data;
}

export async function dispatchOrder(number: string) {
  return (
    await apiFetch(`/admin/orders/${encodeURIComponent(number)}/dispatch`, {
      method: 'POST',
      schema: AdminOrderDetailResponseSchema,
    })
  ).data;
}
