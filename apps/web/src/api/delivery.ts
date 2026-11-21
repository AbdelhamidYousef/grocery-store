import {
  DeliveryAreasResponseSchema,
  DeliveryMethodsResponseSchema,
  PostcodeLookupResponseSchema,
} from '@store/shared';

import { apiFetch } from './client';

// The transit ranges of the active shipping methods. `offsetMs` is the server's clock minus this
// device's clock when the answer arrived: the estimate adds it to Date.now(), so a device with a
// wrong clock still counts down to the real cutoff (same idea as the sale banner).
export async function fetchDeliveryMethods(signal?: AbortSignal) {
  const { data } = await apiFetch('/delivery-methods', {
    schema: DeliveryMethodsResponseSchema,
    ...(signal && { signal }),
  });
  return { methods: data.methods, offsetMs: Date.parse(data.serverNow) - Date.now() };
}

// Which area and dark store serve a postcode (or that none does).
export async function fetchPostcode(code: string, signal?: AbortSignal) {
  const { data } = await apiFetch(`/delivery/postcodes/${encodeURIComponent(code)}`, {
    schema: PostcodeLookupResponseSchema,
    ...(signal && { signal }),
  });
  return data;
}

// Every area with its store and postcodes: the delivery page and the "we cover ..." lists.
export async function fetchDeliveryAreas(signal?: AbortSignal) {
  const { data } = await apiFetch('/delivery/areas', {
    schema: DeliveryAreasResponseSchema,
    ...(signal && { signal }),
  });
  return data;
}
