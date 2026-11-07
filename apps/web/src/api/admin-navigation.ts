import {
  AdminMenuPromoListResponseSchema,
  AdminMenuPromoResponseSchema,
  type AdminMenuPromoInput,
  type AdminMenuPromoUpdate,
} from '@store/shared';

import { NoContentSchema } from './auth';
import { apiFetch } from './client';

// Back-office calls for the mega-menu promo tiles (the API answers 401/403 to non-admins).
const id = encodeURIComponent;

export async function fetchAdminMenuPromos(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/menu-promos', {
      schema: AdminMenuPromoListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function createAdminMenuPromo(input: AdminMenuPromoInput) {
  return (
    await apiFetch('/admin/menu-promos', {
      method: 'POST',
      body: input,
      schema: AdminMenuPromoResponseSchema,
    })
  ).data;
}

export async function updateAdminMenuPromo(promoId: string, input: AdminMenuPromoUpdate) {
  return (
    await apiFetch(`/admin/menu-promos/${id(promoId)}`, {
      method: 'PATCH',
      body: input,
      schema: AdminMenuPromoResponseSchema,
    })
  ).data;
}

export async function deleteAdminMenuPromo(promoId: string): Promise<void> {
  await apiFetch(`/admin/menu-promos/${id(promoId)}`, {
    method: 'DELETE',
    schema: NoContentSchema,
  });
}
