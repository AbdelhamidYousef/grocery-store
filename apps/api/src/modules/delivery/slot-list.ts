import {
  dateKeyIn,
  isSlotClosed,
  type DeliverySlot,
  type SlotDay,
  type SlotsResponse,
} from '@store/shared';
import { and, asc, count, eq, gt, notInArray } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { darkStores, deliverySlots, orders, slotHolds } from '../../db/schema/index.ts';
import { notFound } from '../../lib/errors.ts';
import { currentDelivery } from '../i18n/context.ts';

import { expressStatus } from './holds.ts';

/**
 * The slots a shopper can see for the store of the request (the `X-Postcode` one): days in the
 * shop's zone, each slot with the places left and open / full / closed. "Remaining" is counted from
 * live holds and booked orders, the same count a booking makes under its lock; this read takes no
 * lock, so it can be a moment behind (the booking is the judge).
 */
export async function listSlots(now: Date = new Date()): Promise<SlotsResponse['data']> {
  const { storeId, served } = currentDelivery();
  const [store] = await db.select().from(darkStores).where(eq(darkStores.id, storeId));
  if (!store) throw notFound('Store not found');

  const slots = await db
    .select()
    .from(deliverySlots)
    .where(and(eq(deliverySlots.storeId, storeId), gt(deliverySlots.endsAt, now)))
    .orderBy(asc(deliverySlots.startsAt));

  const holds = await db
    .select({ slotId: slotHolds.slotId, n: count() })
    .from(slotHolds)
    .innerJoin(deliverySlots, eq(deliverySlots.id, slotHolds.slotId))
    .where(
      and(
        eq(deliverySlots.storeId, storeId),
        gt(deliverySlots.endsAt, now),
        gt(slotHolds.expiresAt, now),
      ),
    )
    .groupBy(slotHolds.slotId);
  const booked = await db
    .select({ slotId: orders.slotId, n: count() })
    .from(orders)
    .innerJoin(deliverySlots, eq(deliverySlots.id, orders.slotId))
    .where(
      and(
        eq(deliverySlots.storeId, storeId),
        gt(deliverySlots.endsAt, now),
        notInArray(orders.status, ['cancelled', 'refunded']),
      ),
    )
    .groupBy(orders.slotId);
  const taken = new Map<string, number>();
  for (const r of [...holds, ...booked]) {
    if (r.slotId) taken.set(r.slotId, (taken.get(r.slotId) ?? 0) + r.n);
  }

  const days: SlotDay[] = [];
  for (const slot of slots) {
    const remaining = Math.max(0, slot.capacity - (taken.get(slot.id) ?? 0));
    const dto: DeliverySlot = {
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      remaining,
      status: isSlotClosed(slot.startsAt, now) ? 'closed' : remaining === 0 ? 'full' : 'open',
    };
    const date = dateKeyIn(slot.startsAt);
    const last = days[days.length - 1];
    if (last?.date === date) last.slots.push(dto);
    else days.push({ date, slots: [dto] });
  }

  return {
    serverNow: now.toISOString(),
    days,
    express: served
      ? await expressStatus(db, store, now)
      : { available: false, reason: 'no_postcode' },
  };
}
