import {
  ErrorCode,
  PICK_ORDER_LIMIT,
  type PickingOrder,
  type PickingResult,
  type PickLine,
  type PickLineAction,
} from '@store/shared';
import { and, asc, count, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import {
  aisles,
  darkStores,
  orderItemBatches,
  orderItems,
  orders,
  productVariants,
  products,
  stockBatches,
} from '../../db/schema/index.ts';
import { conflict, notFound, unprocessable } from '../../lib/errors.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import { optionsFor } from '../substitutions/service.ts';

import { buildPickList, isLineResolved, zoneOfStorage } from './pick-list.ts';

// How far ahead the "next" view looks: windows that start within two hours (or already started).
export const PICK_HORIZON_MS = 2 * 3_600_000;

export async function listStores() {
  return db
    .select({ slug: darkStores.slug, name: darkStores.name })
    .from(darkStores)
    .where(eq(darkStores.active, true))
    .orderBy(asc(darkStores.name));
}

const firstName = (full: string | undefined): string | null => {
  const first = full?.trim().split(/\s+/)[0];
  return first ? first : null;
};

/**
 * The packer's picture of one dark store: the orders to pack (paid or being packed, not handed to a
 * rider), oldest window first, and the pick list merged over all of them. The bag number is the
 * order's place in that sequence.
 */
export async function getPicking(
  slug: string,
  window: 'next' | 'all',
  now: Date = new Date(),
  limit: number = PICK_ORDER_LIMIT,
): Promise<PickingResult> {
  const [store] = await db
    .select({ id: darkStores.id, slug: darkStores.slug, name: darkStores.name })
    .from(darkStores)
    .where(eq(darkStores.slug, slug));
  if (!store) throw notFound('Store not found');

  const due = [
    eq(orders.darkStoreId, store.id),
    inArray(orders.status, ['paid', 'processing']),
    isNull(orders.dispatchedAt),
  ];
  if (window === 'next') {
    const horizon = new Date(now.getTime() + PICK_HORIZON_MS);
    const soon = or(eq(orders.deliveryKind, 'express'), lte(orders.deliveryFrom, horizon));
    if (soon) due.push(soon);
  }
  const rows = await db
    .select()
    .from(orders)
    .where(and(...due))
    .orderBy(sql`${orders.deliveryFrom} asc nulls last`, asc(orders.placedAt), asc(orders.number))
    .limit(limit);
  const [totals] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(...due));

  const orderIds = rows.map((o) => o.id);
  const items = orderIds.length
    ? await db
        .select({
          item: orderItems,
          storage: sql<string | null>`${products.attributes}->>'storage'`,
          aisle: aisles.aisle,
          zone: aisles.zone,
        })
        .from(orderItems)
        .leftJoin(productVariants, eq(productVariants.id, orderItems.variantId))
        .leftJoin(products, eq(products.id, productVariants.productId))
        .leftJoin(
          aisles,
          and(eq(aisles.subcategoryId, products.categoryId), eq(aisles.storeId, store.id)),
        )
        .where(inArray(orderItems.orderId, orderIds))
        .orderBy(asc(orderItems.createdAt), asc(orderItems.id))
    : [];
  const itemIds = items.map((i) => i.item.id);
  const batchRows = itemIds.length
    ? await db
        .select({
          itemId: orderItemBatches.orderItemId,
          quantity: orderItemBatches.quantity,
          bestBefore: stockBatches.bestBefore,
        })
        .from(orderItemBatches)
        .innerJoin(stockBatches, eq(stockBatches.id, orderItemBatches.batchId))
        .where(inArray(orderItemBatches.orderItemId, itemIds))
        .orderBy(sql`${stockBatches.bestBefore} asc nulls last`, asc(stockBatches.receivedAt))
    : [];
  const batchesOf = new Map<string, { bestBefore: string | null; quantity: number }[]>();
  for (const b of batchRows) {
    const list = batchesOf.get(b.itemId) ?? [];
    // One entry per best-before date (a line may have taken two packs of the same date).
    const same = list.find((x) => x.bestBefore === b.bestBefore);
    if (same) same.quantity += b.quantity;
    else list.push({ bestBefore: b.bestBefore, quantity: b.quantity });
    batchesOf.set(b.itemId, list);
  }

  const allLines: PickLine[] = [];
  const result: PickingOrder[] = rows.map((o, index) => {
    const bag = index + 1;
    const mine = items.filter((i) => i.item.orderId === o.id);
    const nameOf = new Map(mine.map((i) => [i.item.id, i.item.productName]));
    const lines = mine.map(({ item, storage, aisle, zone }): PickLine => {
      const base = {
        pickStatus: item.pickStatus,
        pickedQty: item.pickedQty,
        weighed: item.pricePerKgCents !== null,
        packedGrams: item.packedGrams,
        swapStatus: item.swapStatus,
      };
      const line: PickLine = {
        itemId: item.id,
        orderNumber: o.number,
        bag,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        ...base,
        pricePerKgCents: item.pricePerKgCents,
        replaces: item.substitutesItemId ? (nameOf.get(item.substitutesItemId) ?? null) : null,
        substitution: item.substitution,
        zone: zone ?? zoneOfStorage(storage ?? undefined),
        aisle: aisle ?? null,
        batches: batchesOf.get(item.id) ?? [],
        resolved: isLineResolved(base),
      };
      return line;
    });
    allLines.push(...lines.filter((l) => l.swapStatus !== 'rejected'));
    return {
      number: o.number,
      bag,
      status: o.status as 'paid' | 'processing',
      deliveryKind: o.deliveryKind,
      deliveryFrom: o.deliveryFrom?.toISOString() ?? null,
      deliveryTo: o.deliveryTo?.toISOString() ?? null,
      firstName: firstName(o.shippingAddress?.fullName),
      packedAt: o.packedAt?.toISOString() ?? null,
      lines,
      openLines: lines.filter((l) => !l.resolved).length,
      openSwaps: lines.filter((l) => l.swapStatus === 'proposed').length,
    };
  });

  return {
    store: { slug: store.slug, name: store.name },
    generatedAt: now.toISOString(),
    totalOrders: totals?.n ?? rows.length,
    orders: result,
    pickList: buildPickList(allLines),
  };
}

export interface PickLineResult {
  orderNumber: string;
  itemId: string;
  pickStatus: 'pending' | 'picked' | 'short' | 'missing' | 'substituted';
  packedGrams: number | null;
}

// Phases an order's lines can still be marked in: paid or being packed, the bag still open.
export function assertOpenBag(order: checkoutRepo.OrderRow): void {
  if (!['paid', 'processing'].includes(order.status) || order.dispatchedAt !== null) {
    throw conflict(ErrorCode.CONFLICT, 'This order is not being packed');
  }
  if (order.packedAt !== null) {
    throw conflict(ErrorCode.CONFLICT, 'This bag is already packed');
  }
  if (order.capturedCents !== null) {
    throw conflict(ErrorCode.CONFLICT, 'This order is already charged');
  }
}

/**
 * The packer marks one line: everything found, the grams on the scale for a weighed line, or undo.
 * Short and missing units go through `recordShortfall` (the swap rules), not here. Grams are kept on
 * the line (`packed_grams`) and only frozen into the price at dispatch (`finalizeOrder`), so a typo
 * on the scale can be corrected until the bag leaves.
 */
export async function markLine(
  orderNumber: string,
  itemId: string,
  input: PickLineAction,
  actor: string,
): Promise<PickLineResult> {
  const seen = await checkoutRepo.findOrderByNumber(orderNumber);
  if (!seen) throw notFound('Order not found');
  return db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, seen.id);
    if (!order) throw notFound('Order not found');
    const items = await checkoutRepo.listOrderItems(tx, order.id);
    const item = items.find((i) => i.id === itemId);
    if (!item) throw notFound('Order line not found');
    assertOpenBag(order);
    if (item.swapStatus === 'rejected') {
      throw conflict(ErrorCode.CONFLICT, 'The shopper refused this replacement');
    }
    const weighed = item.pricePerKgCents !== null;
    const isReplacement = item.substitutesItemId !== null;
    const settled = item.pickStatus === 'short' || item.pickStatus === 'substituted';

    let set: Partial<typeof orderItems.$inferInsert>;
    if (input.action === 'found') {
      if (weighed) throw unprocessable('This item is sold by weight: enter what it weighs');
      if (isReplacement) return result(order.number, item);
      if (item.pickStatus === 'picked') return result(order.number, item);
      if (item.pickStatus !== 'pending') {
        throw conflict(ErrorCode.CONFLICT, 'A shortfall is already recorded for this line');
      }
      set = { pickStatus: 'picked' };
    } else if (input.action === 'weigh') {
      if (!weighed) throw unprocessable(`${item.productName} is not sold by weight`);
      if (item.pickStatus === 'missing') {
        throw unprocessable('None of this item was found: there is nothing to weigh');
      }
      set = {
        packedGrams: input.grams,
        ...(settled || isReplacement ? {} : { pickStatus: 'picked' }),
      };
    } else {
      // reset: back to "to do". A recorded shortfall stays (it moved stock and mail); only grams clear.
      if (isReplacement || settled || item.pickStatus === 'missing') {
        if (!weighed) throw conflict(ErrorCode.CONFLICT, 'A recorded shortfall cannot be undone');
        set = { packedGrams: null };
      } else set = { pickStatus: 'pending', packedGrams: null };
    }
    const [updated] = await tx
      .update(orderItems)
      .set(set)
      .where(eq(orderItems.id, item.id))
      .returning();
    await checkoutRepo.insertHistory(tx, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: order.status,
      actor,
      note:
        input.action === 'weigh'
          ? `${item.productName}: ${input.grams} g on the scale`
          : input.action === 'found'
            ? `${item.productName}: all ${item.quantity} found`
            : `${item.productName}: pick undone`,
    });
    return result(order.number, updated ?? item);
  });
}

const result = (number: string, item: checkoutRepo.OrderItemRow): PickLineResult => ({
  orderNumber: number,
  itemId: item.id,
  pickStatus: item.pickStatus,
  packedGrams: item.packedGrams,
});

/**
 * Replacements the packer may offer for a line, from the order's own store (never the packer's
 * postcode): the same safe, similar, in-stock list the shopper's page uses. Nothing when the shopper
 * asked for no replacement.
 */
export async function substitutesForLine(orderNumber: string, itemId: string) {
  const order = await checkoutRepo.findOrderByNumber(orderNumber);
  if (!order) throw notFound('Order not found');
  const items = await checkoutRepo.listOrderItems(db, order.id);
  const item = items.find((i) => i.id === itemId);
  if (!item) throw notFound('Order line not found');
  if (item.substitution === 'none' || !item.variantId || item.substitutesItemId) return [];
  return optionsFor(db, item.variantId, checkoutRepo.storeOfOrder(order), order.currency);
}
