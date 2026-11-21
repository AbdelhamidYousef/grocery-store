import type { TrackedOrder, TrackOrderBody } from '@store/shared';
import { asc, eq } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { orderItems, orderStatusHistory } from '../../db/schema/index.ts';
import { notFound } from '../../lib/errors.ts';

import { findOwnedOrder } from './ownership.ts';
import { statusLabel, trackingOf } from './status-labels.ts';

// One message for every failure, so a wrong email and an unknown order are byte-for-byte equal.
export const NO_SUCH_ORDER = 'We could not find an order with that number and email.';

export async function trackOrder(body: TrackOrderBody): Promise<TrackedOrder> {
  const order = await findOwnedOrder(body.orderNumber, body.email);
  if (!order) throw notFound(NO_SUCH_ORDER);

  const [items, history] = await Promise.all([
    db
      .select({
        name: orderItems.productName,
        variantName: orderItems.variantName,
        quantity: orderItems.quantity,
        id: orderItems.id,
        pickStatus: orderItems.pickStatus,
        pickedQty: orderItems.pickedQty,
        substitutesItemId: orderItems.substitutesItemId,
        swapStatus: orderItems.swapStatus,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id)),
  ]);

  return {
    orderNumber: order.number,
    status: order.status,
    statusLabel: statusLabel(order.status),
    placedAt: order.placedAt?.toISOString() ?? null,
    // Replacements are not "in the order" until accepted; a rejected one is not shown at all.
    items: items
      .filter((i) => i.swapStatus !== 'rejected')
      .map(({ name, variantName, quantity }) => ({ name, variantName, quantity })),
    changes: items
      .filter(
        (i) =>
          i.substitutesItemId === null &&
          (i.pickStatus === 'missing' ||
            i.pickStatus === 'short' ||
            i.pickStatus === 'substituted'),
      )
      .map((i) => {
        const sub = items.find((r) => r.substitutesItemId === i.id);
        return {
          name: i.name,
          picked: i.pickedQty ?? 0,
          quantity: i.quantity,
          replacement:
            sub && sub.swapStatus
              ? { name: sub.name, quantity: sub.quantity, status: sub.swapStatus }
              : null,
        };
      }),
    tracking: trackingOf(order),
    delivery:
      order.deliveryKind && order.deliveryFrom && order.deliveryTo
        ? {
            kind: order.deliveryKind,
            from: order.deliveryFrom.toISOString(),
            to: order.deliveryTo.toISOString(),
          }
        : null,
    // `actor` and `note` stay inside: a note may be an admin's private remark.
    timeline: history.map((h) => ({
      status: h.toStatus,
      label: statusLabel(h.toStatus),
      at: h.createdAt.toISOString(),
    })),
  };
}
