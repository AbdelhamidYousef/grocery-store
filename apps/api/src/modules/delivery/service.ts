import type { DeliveryArea, PostcodeLookup } from '@store/shared';

import { lookupPostcode } from './areas.ts';
import * as repo from './repo.ts';

export async function lookup(code: string): Promise<PostcodeLookup> {
  const row = await lookupPostcode(code);
  if (!row) return { postcode: code, served: false };
  return {
    postcode: code,
    served: true,
    area: { slug: row.areaSlug, name: row.areaName },
    store: { slug: row.storeSlug, name: row.storeName },
  };
}

export async function listAreas(): Promise<DeliveryArea[]> {
  const { areas, codes } = await repo.listAreas();
  return areas.map((a) => ({
    slug: a.slug,
    name: a.name,
    store: {
      slug: a.storeSlug,
      name: a.storeName,
      street: a.street,
      postalCode: a.storePostalCode,
    },
    postcodes: codes.filter((c) => c.areaId === a.areaId).map((c) => c.code),
  }));
}
