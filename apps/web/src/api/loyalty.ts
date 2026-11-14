import { PointsResponseSchema, type PointsSummary } from '@store/shared';

import { apiFetch } from './client';

export async function fetchPoints(signal?: AbortSignal): Promise<PointsSummary> {
  return (await apiFetch('/me/points', { schema: PointsResponseSchema, ...(signal && { signal }) }))
    .data;
}
