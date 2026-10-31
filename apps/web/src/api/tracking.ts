import { TrackOrderResponseSchema, type TrackedOrder, type TrackOrderBody } from '@store/shared';

import { apiFetch } from './client';

// POST because the answer depends on a secret pair (order number + email): a GET would put the
// email in the URL, the server log and the browser history.
export async function trackOrder(body: TrackOrderBody): Promise<TrackedOrder> {
  return (
    await apiFetch('/orders/track', { method: 'POST', body, schema: TrackOrderResponseSchema })
  ).data;
}
