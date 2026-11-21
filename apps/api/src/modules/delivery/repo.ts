import { and, asc, eq } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { darkStores, deliveryAreas, postcodes } from '../../db/schema/index.ts';

export interface PostcodeRow {
  code: string;
  areaSlug: string;
  areaName: string;
  storeId: string;
  storeSlug: string;
  storeName: string;
}

// The whole table, joined: every postcode of an active area that has an active store.
export async function loadServedPostcodes(): Promise<PostcodeRow[]> {
  return db
    .select({
      code: postcodes.code,
      areaSlug: deliveryAreas.slug,
      areaName: deliveryAreas.name,
      storeId: darkStores.id,
      storeSlug: darkStores.slug,
      storeName: darkStores.name,
    })
    .from(postcodes)
    .innerJoin(deliveryAreas, eq(deliveryAreas.id, postcodes.areaId))
    .innerJoin(darkStores, eq(darkStores.areaId, deliveryAreas.id))
    .where(and(eq(deliveryAreas.active, true), eq(darkStores.active, true)));
}

export async function listAreas() {
  const areas = await db
    .select({
      areaId: deliveryAreas.id,
      slug: deliveryAreas.slug,
      name: deliveryAreas.name,
      storeSlug: darkStores.slug,
      storeName: darkStores.name,
      street: darkStores.street,
      storePostalCode: darkStores.postalCode,
    })
    .from(deliveryAreas)
    .innerJoin(darkStores, eq(darkStores.areaId, deliveryAreas.id))
    .where(eq(deliveryAreas.active, true))
    .orderBy(asc(deliveryAreas.name));
  const codes = await db
    .select({ code: postcodes.code, areaId: postcodes.areaId })
    .from(postcodes)
    .orderBy(asc(postcodes.code));
  return { areas, codes };
}
