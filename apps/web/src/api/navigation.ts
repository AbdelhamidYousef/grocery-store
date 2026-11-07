import { NavigationResponseSchema } from '@store/shared';

import { apiFetch } from './client';

export async function fetchNavigation(signal?: AbortSignal) {
  return (
    await apiFetch('/navigation', {
      schema: NavigationResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
