import { AdminStatsResponseSchema, type AdminStats } from '@store/shared';

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
