import { slotsForHorizon } from '@store/shared';
import { eq } from 'drizzle-orm';

import type { db, Tx } from '../../db/client.ts';
import { darkStores, deliverySlots } from '../../db/schema/index.ts';

/** "08:00:00" (Postgres `time`) to "08:00". */
const hhmm = (time: string): string => time.slice(0, 5);

/**
 * Creates the slots of the next days for every active store, from its opening hours and with its
 * capacity. Idempotent: the unique (store, starts_at) key makes a second run insert nothing, and a
 * slot that exists keeps the capacity it was created with (and the bookings counted against it).
 */
export async function generateSlots(
  run: typeof db | Tx,
  now: Date,
): Promise<{ stores: number; created: number }> {
  const stores = await run.select().from(darkStores).where(eq(darkStores.active, true));
  let created = 0;
  for (const store of stores) {
    const windows = slotsForHorizon(now, hhmm(store.opensAt), hhmm(store.closesAt));
    if (windows.length === 0) continue;
    const rows = await run
      .insert(deliverySlots)
      .values(
        windows.map((w) => ({
          storeId: store.id,
          startsAt: w.startsAt,
          endsAt: w.endsAt,
          capacity: store.slotCapacity,
        })),
      )
      .onConflictDoNothing({ target: [deliverySlots.storeId, deliverySlots.startsAt] })
      .returning({ id: deliverySlots.id });
    created += rows.length;
  }
  return { stores: stores.length, created };
}
