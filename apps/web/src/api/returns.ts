import {
  AdminReturnDetailResponseSchema,
  AdminReturnListResponseSchema,
  OrderReturnsResponseSchema,
  ReturnResponseSchema,
  type ReturnRequestBody,
  type ReturnStatus,
} from '@store/shared';

import { apiFetch } from './client';

const id = encodeURIComponent;

// ---------- customer ----------

export async function fetchOrderReturns(number: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/orders/${id(number)}/returns`, {
      schema: OrderReturnsResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function requestReturn(number: string, body: ReturnRequestBody) {
  return (
    await apiFetch(`/orders/${id(number)}/returns`, {
      method: 'POST',
      body,
      schema: ReturnResponseSchema,
    })
  ).data;
}

// ---------- admin ----------

export function fetchAdminReturns(
  status: ReturnStatus | undefined,
  page: number,
  signal?: AbortSignal,
) {
  const qs = new URLSearchParams({ page: String(page) });
  if (status) qs.set('status', status);
  return apiFetch(`/admin/returns?${qs.toString()}`, {
    schema: AdminReturnListResponseSchema,
    ...(signal && { signal }),
  });
}

export async function fetchAdminReturn(returnId: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/admin/returns/${id(returnId)}`, {
      schema: AdminReturnDetailResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export type ReturnAction =
  | { action: 'approve' }
  | { action: 'reject'; reason: string }
  | { action: 'receive'; restockItemIds?: string[] }
  | { action: 'refund'; refundShipping: boolean };

export async function actOnReturn(returnId: string, input: ReturnAction) {
  const { action, ...body } = input;
  return (
    await apiFetch(`/admin/returns/${id(returnId)}/${action}`, {
      method: 'POST',
      body,
      schema: AdminReturnDetailResponseSchema,
    })
  ).data;
}
