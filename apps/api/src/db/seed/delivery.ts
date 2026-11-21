import { sql } from 'drizzle-orm';

import type { db, Tx } from '../client.ts';
import { darkStores, deliveryAreas, postcodes } from '../schema/index.ts';

// Four Berlin delivery areas, one dark store each, and about 30 real postcodes. The ids are fixed
// (not random) on purpose: migration 0047 creates the same four stores so existing stock can be
// copied to them, the test setup re-creates them after every truncate, and a fixed id means all
// three agree without a lookup. The street addresses are made up.
export interface AreaSeed {
  id: string;
  storeId: string;
  slug: string;
  name: string;
  storeName: string;
  street: string;
  storePostalCode: string;
  postcodes: readonly string[];
}

export const AREA_SEEDS: readonly AreaSeed[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    storeId: 'b0000000-0000-4000-8000-000000000001',
    slug: 'mitte',
    name: 'Mitte',
    storeName: 'Grocery Mitte',
    street: 'Brunnenstraße 14',
    storePostalCode: '10119',
    postcodes: ['10115', '10117', '10119', '10178', '10179', '10551', '10553', '10557'],
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    storeId: 'b0000000-0000-4000-8000-000000000002',
    slug: 'prenzlauer-berg',
    name: 'Prenzlauer Berg',
    storeName: 'Grocery Prenzlauer Berg',
    street: 'Greifswalder Straße 40',
    storePostalCode: '10405',
    postcodes: ['10405', '10407', '10409', '10435', '10437', '10439'],
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    storeId: 'b0000000-0000-4000-8000-000000000003',
    slug: 'kreuzberg-friedrichshain',
    name: 'Kreuzberg-Friedrichshain',
    storeName: 'Grocery Kreuzberg-Friedrichshain',
    street: 'Skalitzer Straße 72',
    storePostalCode: '10997',
    postcodes: [
      '10243',
      '10245',
      '10247',
      '10249',
      '10961',
      '10963',
      '10965',
      '10967',
      '10969',
      '10997',
      '10999',
    ],
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    storeId: 'b0000000-0000-4000-8000-000000000004',
    slug: 'neukoelln',
    name: 'Neukölln',
    storeName: 'Grocery Neukölln',
    street: 'Sonnenallee 95',
    storePostalCode: '12045',
    postcodes: ['12043', '12045', '12047', '12049', '12051', '12053', '12055', '12057', '12059'],
  },
];

/** The store of the area every shopper gets until a postcode says otherwise. */
export const DEFAULT_STORE_ID = AREA_SEEDS[0]!.storeId;
export const storeIdBySlug = (slug: string): string | undefined =>
  AREA_SEEDS.find((a) => a.slug === slug)?.storeId;

const excluded = (column: string) => sql.raw(`excluded."${column}"`);

/** Idempotent: safe to run again (the seed) and after a truncate (the test setup). */
export async function seedDelivery(run: typeof db | Tx): Promise<void> {
  await run
    .insert(deliveryAreas)
    .values(AREA_SEEDS.map((a) => ({ id: a.id, slug: a.slug, name: a.name })))
    .onConflictDoUpdate({ target: deliveryAreas.id, set: { name: excluded('name') } });
  await run
    .insert(darkStores)
    .values(
      AREA_SEEDS.map((a) => ({
        id: a.storeId,
        slug: a.slug,
        name: a.storeName,
        street: a.street,
        postalCode: a.storePostalCode,
        areaId: a.id,
      })),
    )
    .onConflictDoUpdate({
      target: darkStores.id,
      set: {
        name: excluded('name'),
        street: excluded('street'),
        postalCode: excluded('postal_code'),
      },
    });
  await run
    .insert(postcodes)
    .values(AREA_SEEDS.flatMap((a) => a.postcodes.map((code) => ({ code, areaId: a.id }))))
    .onConflictDoUpdate({ target: postcodes.code, set: { areaId: excluded('area_id') } });
}
