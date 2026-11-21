import { addDays } from '@store/shared';

export interface SeedBatch {
  bestBefore: string | null;
  quantity: number;
}

// The batches of one seeded stock row (deterministic from `key`, so a re-seed on a fresh database
// looks the same). Non-food is one undated batch. Food is one or two fresh batches, plus now and
// then a short-dated one (best before in 1 to 2 days) so the demo shows reduced prices, and, more
// rarely, a pack or two already past its date, which the `write-off-expired` job then clears.
export function seedBatches(opts: {
  quantity: number;
  shelfLifeDays: number | null;
  key: number;
  today: string;
}): SeedBatch[] {
  const { quantity, shelfLifeDays, key, today } = opts;
  if (quantity <= 0) return [];
  if (shelfLifeDays === null) return [{ bestBefore: null, quantity }];

  const batches: SeedBatch[] = [];
  let left = quantity;
  if (key % 6 === 2 && left >= 3) {
    const n = Math.min(left - 1, 2 + (key % 3));
    batches.push({ bestBefore: addDays(today, 1 + (key % 2)), quantity: n });
    left -= n;
  }
  if (key % 23 === 5 && left >= 3) {
    const n = 1 + (key % 2);
    batches.push({ bestBefore: addDays(today, -1), quantity: n });
    left -= n;
  }
  // Fresh stock: at least three days out, so it is never short-dated on the day it is seeded.
  const fresh = Math.max(3, shelfLifeDays);
  if (key % 2 === 0 && left >= 2) {
    const older = Math.ceil(left / 2);
    batches.push({
      bestBefore: addDays(today, Math.max(3, Math.floor(fresh * 0.6))),
      quantity: older,
    });
    left -= older;
  }
  if (left > 0) batches.push({ bestBefore: addDays(today, fresh), quantity: left });
  return batches;
}
