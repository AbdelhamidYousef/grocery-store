import { ActiveSafetyNoticesResponseSchema } from '@store/shared';

import { apiFetch } from './client';

export async function fetchActiveSafetyNotices(signal?: AbortSignal) {
  return (
    await apiFetch('/safety-notices/active', {
      schema: ActiveSafetyNoticesResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
