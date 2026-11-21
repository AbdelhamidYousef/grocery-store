import type { PickZone } from '@store/shared';

import type { db, Tx } from '../client.ts';
import { aisles } from '../schema/index.ts';

import { departmentSeeds } from './catalogue.ts';
import { AREA_SEEDS } from './delivery.ts';

// One shop layout reused by all four dark stores, with a small, fixed shuffle per store so that the
// pick lists differ (a real chain's stores are never identical). Aisles are numbered inside a zone:
// the pick list sorts by zone (ambient, chilled, frozen), then aisle.
const ZONE_OF_DEPARTMENT: Record<string, PickZone> = {
  'dairy-eggs': 'chilled',
  'meat-fish': 'chilled',
  frozen: 'frozen',
};

export interface AisleSeed {
  subcategorySlug: string;
  aisle: number;
  zone: PickZone;
}

/** The layout of store number `storeIndex`: deterministic, so a re-seed never moves the shelves. */
export function aisleLayout(storeIndex: number): AisleSeed[] {
  const byZone = new Map<PickZone, string[]>();
  for (const d of departmentSeeds) {
    const zone = ZONE_OF_DEPARTMENT[d.slug] ?? 'ambient';
    const list = byZone.get(zone) ?? [];
    for (const child of d.children) list.push(child.slug);
    byZone.set(zone, list);
  }
  const out: AisleSeed[] = [];
  for (const [zone, slugs] of byZone) {
    // The shuffle: in store k, every third neighbouring pair (starting at k) swaps places.
    const order = [...slugs];
    if (storeIndex > 0) {
      for (let i = storeIndex % 3; i + 1 < order.length; i += 3) {
        const a = order[i];
        const b = order[i + 1];
        if (a !== undefined && b !== undefined) [order[i], order[i + 1]] = [b, a];
      }
    }
    order.forEach((subcategorySlug, i) => out.push({ subcategorySlug, aisle: i + 1, zone }));
  }
  return out;
}

/** Insert only (a re-seed never rewrites a layout someone has since edited). */
export async function seedAisles(
  run: typeof db | Tx,
  categoryId: ReadonlyMap<string, string>,
): Promise<number> {
  const rows = AREA_SEEDS.flatMap((area, storeIndex) =>
    aisleLayout(storeIndex).flatMap((a) => {
      const subcategoryId = categoryId.get(a.subcategorySlug);
      return subcategoryId
        ? [{ storeId: area.storeId, subcategoryId, aisle: a.aisle, zone: a.zone }]
        : [];
    }),
  );
  if (rows.length === 0) return 0;
  await run.insert(aisles).values(rows).onConflictDoNothing();
  return rows.length;
}
