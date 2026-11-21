import {
  DeliveryAreasResponseSchema,
  PostcodeLookupResponseSchema,
  SlotsResponseSchema,
} from '@store/shared';

import { apiFetch } from './client';

// The slots of the postcode's store, with the places left and whether express is on offer.
// `offsetMs` is the server's clock minus this device's clock when the answer arrived: the hold
// countdown adds it to Date.now(), so a device with a wrong clock still counts down correctly
// (same idea as the sale banner).
export async function fetchSlots(signal?: AbortSignal) {
  const { data } = await apiFetch('/delivery/slots', {
    schema: SlotsResponseSchema,
    ...(signal && { signal }),
  });
  return { ...data, offsetMs: Date.parse(data.serverNow) - Date.now() };
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
