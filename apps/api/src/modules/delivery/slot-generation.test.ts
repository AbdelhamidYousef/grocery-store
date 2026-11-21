import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { darkStores, deliverySlots } from '../../db/schema/index.ts';
import { DEFAULT_STORE_ID } from '../../db/seed/delivery.ts';
import { forgetRun, runJob } from '../../jobs/runner.ts';

import { generateSlots } from './slot-generation.ts';

const NOW = new Date('2026-11-23T10:00:00Z'); // Mon 23 Nov, 11:00 Berlin

const slotsOf = (storeId: string) =>
  db.select().from(deliverySlots).where(eq(deliverySlots.storeId, storeId));

describe('generateSlots', () => {
  it('creates 7 days of one-hour slots for each of the four stores', async () => {
    const result = await generateSlots(db, NOW);
    expect(result).toEqual({ stores: 4, created: 4 * 7 * 14 });
    const rows = (await slotsOf(DEFAULT_STORE_ID)).sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );
    expect(rows).toHaveLength(98);
    expect(rows[0]!.startsAt.toISOString()).toBe('2026-11-23T07:00:00.000Z'); // 08:00 Berlin
    expect(rows[0]!.capacity).toBe(8);
    expect(rows[97]!.endsAt.toISOString()).toBe('2026-11-29T21:00:00.000Z'); // 22:00 Berlin, day 7
  });

  it('is idempotent: a second run creates nothing and changes nothing', async () => {
    await generateSlots(db, NOW);
    const before = await slotsOf(DEFAULT_STORE_ID);
    expect(await generateSlots(db, NOW)).toEqual({ stores: 4, created: 0 });
    expect(await slotsOf(DEFAULT_STORE_ID)).toHaveLength(before.length);
  });

  it('adds only the new day when the horizon moves', async () => {
    await generateSlots(db, NOW);
    const next = new Date(NOW.getTime() + 24 * 3_600_000);
    expect(await generateSlots(db, next)).toEqual({ stores: 4, created: 4 * 14 });
  });

  it("uses a store's own hours and capacity, and skips inactive stores", async () => {
    await db
      .update(darkStores)
      .set({ opensAt: '10:00', closesAt: '14:00', slotCapacity: 3 })
      .where(eq(darkStores.id, DEFAULT_STORE_ID));
    await db.update(darkStores).set({ active: false }).where(eq(darkStores.slug, 'neukoelln'));
    expect(await generateSlots(db, NOW)).toEqual({ stores: 3, created: 7 * 4 + 2 * 7 * 14 });
    const rows = await slotsOf(DEFAULT_STORE_ID);
    expect(rows).toHaveLength(28);
    expect(rows.every((r) => r.capacity === 3)).toBe(true);
  });

  it('runs as the generate-slots job, once per day', async () => {
    const ctx = { now: NOW, log: { error() {} } as never, gateway: {} as never };
    const first = await runJob('generate-slots', ctx);
    expect(first.status).toBe('ran');
    expect((await runJob('generate-slots', ctx)).status).toBe('skipped');
    await forgetRun('generate-slots', NOW);
    expect((await runJob('generate-slots', ctx)).result).toEqual({ stores: 4, created: 0 });
  });
});
