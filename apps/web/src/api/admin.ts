import {
  AdminInventoryResponseSchema,
  AdminOrderDetailResponseSchema,
  AdminOrderListResponseSchema,
  AdminProductListResponseSchema,
  AdminProductResponseSchema,
  AdminStatsResponseSchema,
  AdminVariantResponseSchema,
  type AdminInventoryResult,
  type AdminOrderDetail,
  type AdminTransition,
  type OrderStatus,
  type AdminInventorySet,
  type AdminProduct,
  type AdminProductCreate,
  type AdminProductUpdate,
  type AdminStats,
  type AdminVariant,
  type AdminVariantInput,
  type AdminVariantUpdate,
  type ProductStatus,
} from '@store/shared';

import { NoContentSchema } from './auth';
import { apiFetch } from './client';

// Every admin call goes through the same apiFetch (cookie session, shared Zod schemas). The API
// answers 401/403 for anyone who is not an admin, so these functions never need to check roles.

export async function fetchAdminStats(signal?: AbortSignal): Promise<AdminStats> {
  return (
    await apiFetch('/admin/stats', {
      schema: AdminStatsResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

// ---------- products ----------

export interface AdminProductListParams {
  q?: string | undefined;
  status?: ProductStatus | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export function toAdminListSearch(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || (key === 'page' && value === 1)) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// The whole envelope: the table needs the rows and the pagination meta together.
export function fetchAdminProducts(params: AdminProductListParams, signal?: AbortSignal) {
  return apiFetch(`/admin/products${toAdminListSearch({ ...params })}`, {
    schema: AdminProductListResponseSchema,
    ...(signal && { signal }),
  });
}

export async function fetchAdminProduct(id: string, signal?: AbortSignal): Promise<AdminProduct> {
  return (
    await apiFetch(`/admin/products/${encodeURIComponent(id)}`, {
      schema: AdminProductResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function createAdminProduct(input: AdminProductCreate): Promise<AdminProduct> {
  return (
    await apiFetch('/admin/products', {
      method: 'POST',
      body: input,
      schema: AdminProductResponseSchema,
    })
  ).data;
}

export async function updateAdminProduct(
  id: string,
  input: AdminProductUpdate,
): Promise<AdminProduct> {
  return (
    await apiFetch(`/admin/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
      schema: AdminProductResponseSchema,
    })
  ).data;
}

export async function addAdminVariant(
  productId: string,
  input: AdminVariantInput,
): Promise<AdminVariant> {
  return (
    await apiFetch(`/admin/products/${encodeURIComponent(productId)}/variants`, {
      method: 'POST',
      body: input,
      schema: AdminVariantResponseSchema,
    })
  ).data;
}

export async function updateAdminVariant(
  id: string,
  input: AdminVariantUpdate,
): Promise<AdminVariant> {
  return (
    await apiFetch(`/admin/variants/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
      schema: AdminVariantResponseSchema,
    })
  ).data;
}

export async function deleteAdminVariant(id: string): Promise<void> {
  await apiFetch(`/admin/variants/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    schema: NoContentSchema,
  });
}

export async function setAdminInventory(
  variantId: string,
  input: AdminInventorySet,
): Promise<AdminInventoryResult> {
  return (
    await apiFetch(`/admin/inventory/${encodeURIComponent(variantId)}`, {
      method: 'PATCH',
      body: input,
      schema: AdminInventoryResponseSchema,
    })
  ).data;
}

// ---------- orders ----------

export interface AdminOrderListParams {
  q?: string | undefined;
  status?: OrderStatus | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export function fetchAdminOrders(params: AdminOrderListParams, signal?: AbortSignal) {
  return apiFetch(`/admin/orders${toAdminListSearch({ ...params })}`, {
    schema: AdminOrderListResponseSchema,
    ...(signal && { signal }),
  });
}

export async function fetchAdminOrder(
  number: string,
  signal?: AbortSignal,
): Promise<AdminOrderDetail> {
  return (
    await apiFetch(`/admin/orders/${encodeURIComponent(number)}`, {
      schema: AdminOrderDetailResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

// The answer is the whole fresh detail, including the new `allowedNext`.
export async function transitionAdminOrder(
  number: string,
  input: AdminTransition,
): Promise<AdminOrderDetail> {
  return (
    await apiFetch(`/admin/orders/${encodeURIComponent(number)}/transition`, {
      method: 'POST',
      body: input,
      schema: AdminOrderDetailResponseSchema,
    })
  ).data;
}
