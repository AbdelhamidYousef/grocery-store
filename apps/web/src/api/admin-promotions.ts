import {
  AdminBulkTierListResponseSchema,
  AdminBulkTierResponseSchema,
  AdminDiscountCodeDeleteResponseSchema,
  AdminDiscountCodeListResponseSchema,
  AdminDiscountCodeResponseSchema,
  AdminGiftRuleResponseSchema,
  type AdminBulkTierInput,
  type AdminDiscountCodeInput,
  type AdminGiftRuleInput,
} from '@store/shared';

import { NoContentSchema } from './auth';
import { apiFetch } from './client';

// Back-office calls for discount codes, bulk tiers and the gift rule.

const id = encodeURIComponent;

export async function fetchAdminCodes(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/discount-codes', {
      schema: AdminDiscountCodeListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function createAdminCode(input: AdminDiscountCodeInput) {
  return (
    await apiFetch('/admin/discount-codes', {
      method: 'POST',
      body: input,
      schema: AdminDiscountCodeResponseSchema,
    })
  ).data;
}
export async function updateAdminCode(codeId: string, input: AdminDiscountCodeInput) {
  return (
    await apiFetch(`/admin/discount-codes/${id(codeId)}`, {
      method: 'PUT',
      body: input,
      schema: AdminDiscountCodeResponseSchema,
    })
  ).data;
}
/** Resolves to what the server did: 'deleted' (never used) or 'archived' (it has history). */
export async function deleteAdminCode(codeId: string) {
  return (
    await apiFetch(`/admin/discount-codes/${id(codeId)}`, {
      method: 'DELETE',
      schema: AdminDiscountCodeDeleteResponseSchema,
    })
  ).data.outcome;
}

export async function fetchAdminTiers(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/bulk-tiers', {
      schema: AdminBulkTierListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function createAdminTier(input: AdminBulkTierInput) {
  return (
    await apiFetch('/admin/bulk-tiers', {
      method: 'POST',
      body: input,
      schema: AdminBulkTierResponseSchema,
    })
  ).data;
}
export async function updateAdminTier(tierId: string, input: AdminBulkTierInput) {
  return (
    await apiFetch(`/admin/bulk-tiers/${id(tierId)}`, {
      method: 'PUT',
      body: input,
      schema: AdminBulkTierResponseSchema,
    })
  ).data;
}
export async function deleteAdminTier(tierId: string): Promise<void> {
  await apiFetch(`/admin/bulk-tiers/${id(tierId)}`, { method: 'DELETE', schema: NoContentSchema });
}

export async function fetchAdminGift(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/gift-rule', {
      schema: AdminGiftRuleResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
export async function setAdminGift(input: AdminGiftRuleInput) {
  return (
    await apiFetch('/admin/gift-rule', {
      method: 'PUT',
      body: input,
      schema: AdminGiftRuleResponseSchema,
    })
  ).data;
}
export async function clearAdminGift(): Promise<void> {
  await apiFetch('/admin/gift-rule', { method: 'DELETE', schema: NoContentSchema });
}
