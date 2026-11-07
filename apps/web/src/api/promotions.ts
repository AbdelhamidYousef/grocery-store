import { BannerResponseSchema } from '@store/shared';

import { apiFetch } from './client';

// The flash-sale banner. `offsetMs` is the server's clock minus this device's clock at the moment
// the answer arrived: the countdown adds it to Date.now(), so a device with a wrong clock still
// counts down to the real end.
export async function fetchSaleBanner(signal?: AbortSignal) {
  const { data } = await apiFetch('/promotions/banner', {
    schema: BannerResponseSchema,
    ...(signal && { signal }),
  });
  return { sale: data.sale, offsetMs: Date.parse(data.serverNow) - Date.now() };
}
