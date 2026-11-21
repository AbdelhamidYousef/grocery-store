import {
  ErrorCode,
  isSafeSubstitute,
  swapUnitCents,
  type SubstitutionPreference,
} from '@store/shared';
import { and, eq, isNotNull } from 'drizzle-orm';

import { env } from '../../config/env.ts';
import { db, type Tx } from '../../db/client.ts';
import { orderItems, orders } from '../../db/schema/index.ts';
import { conflict, notFound, unprocessable } from '../../lib/errors.ts';
import { signToken, verifyToken } from '../../lib/signed-token.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import { enqueueEmail } from '../mail/outbox.ts';
import { allocateLineStock, restoreOrderStock, trimLineRecords } from '../stock/batches.ts';

import * as repo from './repo.ts';
import { matchesFor } from './service.ts';

// Substitutions at packing time (G7.2). Three moments, each one transaction that takes the ORDER row
// lock first (then payment, then inventory: the order the rest of the app uses):
//
//   recordShortfall  the packer found fewer than ordered. The line becomes `short`/`missing`; if the
//                    shopper's preference allows it a substitute LINE is added (`proposed`) and its
//                    packs are taken from the order's store, oldest first.
//   decideSwap       the shopper accepts or rejects before dispatch. Rejecting gives the packs back
//                    to the batches they came from. Not charged either way until the capture.
//   rejectAtDoor     (admin, after capture) see door.ts.
//
// Money rule, everywhere: a substitute costs min(its unit price, the original's unit price) per unit.

const SWAP = 'swap';
export const signSwap = (itemId: string): string => signToken(SWAP, itemId);
export const swapLink = (
  order: Pick<checkoutRepo.OrderRow, 'number' | 'storeView'>,
  itemId: string,
  decision: 'accept' | 'reject',
  origin: string = env.WEB_ORIGIN,
): string =>
  `${origin.replace(/\/$/, '')}/${order.storeView}/order-changes/${order.number}?item=${itemId}&decision=${decision}&token=${signSwap(itemId)}`;

// Phases an order can be in for a shortfall or an answer: paid, in the shop's hands, not yet captured.
const PACKING: readonly string[] = ['paid', 'processing'];

const lineStock = (i: checkoutRepo.OrderItemRow) => ({
  id: i.id,
  variantId: i.variantId,
  quantity: i.quantity,
  bundleComponents: i.bundleComponents,
  pickedQty: i.pickedQty,
  swapStatus: i.swapStatus,
});

export interface ShortfallInput {
  /** Units actually found, 0 up to quantity - 1. */
  pickedQty: number;
  /** Packer's own choice of replacement; must be an allowed one for the line's preference. */
  substituteVariantId?: string | undefined;
}

export interface ShortfallResult {
  orderNumber: string;
  originalItemId: string;
  /** The new substitute line (`proposed`), or null when the line is simply short or missing. */
  substituteItemId: string | null;
  pickStatus: 'short' | 'missing' | 'substituted';
}

function resultOf(
  order: checkoutRepo.OrderRow,
  item: checkoutRepo.OrderItemRow,
  items: checkoutRepo.OrderItemRow[],
): ShortfallResult {
  const sub = items.find((i) => i.substitutesItemId === item.id);
  return {
    orderNumber: order.number,
    originalItemId: item.id,
    substituteItemId: sub?.id ?? null,
    pickStatus: item.pickStatus as ShortfallResult['pickStatus'],
  };
}

export async function recordShortfall(
  orderItemId: string,
  input: ShortfallInput,
  actor: string,
  /** When given (the admin URL names the order), the line must belong to it. */
  orderNumber?: string,
): Promise<ShortfallResult> {
  const [seen] = await db
    .select({ orderId: orderItems.orderId, number: orders.number })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orderItems.id, orderItemId));
  if (!seen || (orderNumber !== undefined && seen.number !== orderNumber)) {
    throw notFound('Order line not found');
  }

  return db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, seen.orderId);
    if (!order) throw notFound('Order not found');
    const items = await checkoutRepo.listOrderItems(tx, order.id);
    const item = items.find((i) => i.id === orderItemId);
    if (!item || item.substitutesItemId !== null) {
      throw unprocessable('That line cannot be short: it is a replacement itself');
    }
    if (item.pickStatus !== 'pending') {
      // Same answer twice is the same request (a double click, a retry); a different one is not.
      if (item.pickedQty === input.pickedQty) return resultOf(order, item, items);
      throw conflict(ErrorCode.CONFLICT, 'A shortfall is already recorded for this line');
    }
    if (!PACKING.includes(order.status) || order.capturedCents !== null) {
      throw conflict(
        ErrorCode.CONFLICT,
        'A shortfall can only be recorded for a paid order that is not charged yet',
      );
    }
    if (item.bundleComponents) throw unprocessable('A kit cannot be short: record its parts');
    if (
      !Number.isInteger(input.pickedQty) ||
      input.pickedQty < 0 ||
      input.pickedQty >= item.quantity
    ) {
      throw unprocessable(`Units found must be a whole number from 0 to ${item.quantity - 1}`);
    }
    const missing = item.quantity - input.pickedQty;
    const storeId = checkoutRepo.storeOfOrder(order);

    const chosen = await chooseSubstitute(tx, order, item, missing, input.substituteVariantId);

    // The units that were not found are gone from the shelf already (taken at payment): the record of
    // where they came from shrinks with them, so a later cancel puts back only what was packed.
    await trimLineRecords(tx, item.id, missing);

    let substituteId: string | null = null;
    if (chosen) {
      await checkoutRepo.lockInventory(tx, storeId, [chosen.variantId]);
      const unit = swapUnitCents(item.unitPriceCents, chosen.priceCents);
      const [sub] = await tx
        .insert(orderItems)
        .values({
          orderId: order.id,
          variantId: chosen.variantId,
          productName: chosen.productName,
          variantName: chosen.variantName,
          sku: chosen.sku,
          imageUrl: chosen.imageUrl,
          unitPriceCents: unit,
          listPriceCents: chosen.priceCents,
          quantity: missing,
          lineTotalCents: unit * missing,
          pricePerKgCents: chosen.soldByWeight ? chosen.pricePerKgCents : null,
          substitution: 'none',
          pickStatus: 'picked',
          pickedQty: missing,
          substitutesItemId: item.id,
          swapStatus: 'proposed',
        })
        .returning();
      if (!sub) throw new Error('substitute insert returned no row');
      const taken = await allocateLineStock(tx, storeId, lineStock(sub));
      if (!taken) {
        // Someone bought the last packs between the choice and the lock: no swap, the line is short.
        await tx.delete(orderItems).where(eq(orderItems.id, sub.id));
      } else substituteId = sub.id;
    }

    const status = substituteId ? 'substituted' : input.pickedQty === 0 ? 'missing' : 'short';
    await tx
      .update(orderItems)
      .set({ pickStatus: status, pickedQty: input.pickedQty })
      .where(eq(orderItems.id, item.id));
    await checkoutRepo.insertHistory(tx, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: order.status,
      actor,
      note: substituteId
        ? `${item.productName}: ${input.pickedQty} of ${item.quantity} found, replacement proposed`
        : `${item.productName}: ${input.pickedQty} of ${item.quantity} found, ${missing} not charged`,
    });
    await queueSwapMail(tx, order);
    const fresh = await checkoutRepo.listOrderItems(tx, order.id);
    const updated = fresh.find((i) => i.id === item.id) ?? item;
    return resultOf(order, updated, fresh);
  });
}

type Chosen = NonNullable<Awaited<ReturnType<typeof repo.findCandidate>>> & {
  imageUrl: string | null;
};

// Which product replaces the missing units, or null for none (the line is just short):
//   none      never a replacement (a packer asking for one is refused, not ignored);
//   specific  only the product the shopper chose, if it is still safe and in stock;
//   best_match the packer's pick, or the closest match, among the SAFE ones with enough in stock.
async function chooseSubstitute(
  tx: Tx,
  order: checkoutRepo.OrderRow,
  item: checkoutRepo.OrderItemRow,
  missing: number,
  asked: string | undefined,
): Promise<Chosen | null> {
  const preference: SubstitutionPreference = item.substitution;
  if (preference === 'none') {
    if (asked) throw unprocessable('The shopper asked for no replacement for this item');
    return null;
  }
  if (preference === 'specific' && asked && asked !== item.substituteVariantId) {
    throw unprocessable('The shopper chose a particular product: only that one can replace it');
  }
  if (!item.variantId) return null;
  const storeId = checkoutRepo.storeOfOrder(order);
  // The WHOLE safe list, not a top 5: the packer may pick any safe product, and cutting the list first
  // would refuse a valid pick when a crowded subcategory has many products at the same price.
  const found = await matchesFor(
    tx,
    item.variantId,
    storeId,
    order.currency,
    Number.MAX_SAFE_INTEGER,
  );
  if (!found) return null;
  const withImage = async (c: repo.Candidate): Promise<Chosen> => ({
    ...c,
    imageUrl: (await repo.imagesOf(tx, [c.productId])).get(c.productId)?.url ?? null,
  });

  if (preference === 'specific') {
    const wanted = item.substituteVariantId ?? undefined;
    if (!wanted) return pickBest(found.matches, missing, asked, withImage);
    const cand = await repo.findCandidate(tx, wanted, storeId, order.currency);
    // Safety is re-checked here (an allergen may have been added since), the price band is not:
    // the shopper chose this product and the price cap protects the money.
    if (!cand || cand.variantId === found.original.variantId) return null;
    if (!isSafeSubstitute(found.original, cand) || cand.available < missing) return null;
    return withImage(cand);
  }
  return pickBest(found.matches, missing, asked, withImage);
}

async function pickBest(
  matches: repo.Candidate[],
  missing: number,
  asked: string | undefined,
  withImage: (c: repo.Candidate) => Promise<Chosen>,
): Promise<Chosen | null> {
  const enough = matches.filter((m) => m.available >= missing);
  if (asked) {
    const pick = matches.find((m) => m.variantId === asked);
    if (!pick) throw unprocessable('That product is not a safe replacement for this item');
    return pick.available >= missing ? withImage(pick) : null;
  }
  const first = enough[0];
  return first ? withImage(first) : null;
}

// "We changed something in your order": one mail per change, listing every swap still waiting for an
// answer with its signed accept / reject links. Written for the order's language when it is sent.
async function queueSwapMail(tx: Tx, order: checkoutRepo.OrderRow): Promise<void> {
  const items = await checkoutRepo.listOrderItems(tx, order.id);
  const changed = items.filter((i) => i.pickStatus !== 'pending' && i.pickStatus !== 'picked');
  const proposed = items.filter((i) => i.swapStatus === 'proposed');
  await enqueueEmail(tx, {
    kind: 'order_swaps',
    orderId: order.id,
    to: order.email,
    // One mail per recorded change, each listing everything open at that moment.
    dedupeKey: `order_swaps:${order.id}:${changed.length}`,
    payload: {
      links: proposed.map((p) => ({
        itemId: p.id,
        acceptUrl: swapLink(order, p.id, 'accept'),
        rejectUrl: swapLink(order, p.id, 'reject'),
      })),
    },
  });
}

// ---------- the shopper's answer ----------

export type SwapDecision = 'accept' | 'reject';

export interface SwapAnswer {
  orderNumber: string;
  itemId: string;
  swapStatus: 'accepted' | 'rejected';
}

/**
 * The shopper answers one swap before dispatch: signed in as the order's owner, or holding the
 * signed token from the email. Answering the same way again is a no-op; the other way is a 409.
 * Rejecting gives the replacement's packs back to the batches they came from.
 */
export async function decideSwap(
  who: { userId: string | null; token: string | null },
  orderNumber: string,
  itemId: string,
  decision: SwapDecision,
): Promise<SwapAnswer> {
  const seen = await checkoutRepo.findOrderByNumber(orderNumber);
  if (!seen) throw notFound('Order not found');
  const owner = who.userId !== null && seen.userId === who.userId;
  const signed = who.token !== null && verifyToken(SWAP, itemId, who.token);
  // Not found rather than forbidden for a stranger: an order number must not be probeable.
  if (!owner && !signed) throw notFound('Order not found');

  return db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, seen.id);
    if (!order) throw notFound('Order not found');
    const items = await checkoutRepo.listOrderItems(tx, order.id);
    const sub = items.find((i) => i.id === itemId && i.substitutesItemId !== null);
    if (!sub || !sub.swapStatus) throw notFound('Replacement not found');
    const wanted = decision === 'accept' ? 'accepted' : 'rejected';
    if (sub.swapStatus === wanted) return { orderNumber, itemId, swapStatus: wanted };
    if (sub.swapStatus !== 'proposed') {
      throw conflict(ErrorCode.CONFLICT, `This replacement was already ${sub.swapStatus}`);
    }
    if (!PACKING.includes(order.status) || order.capturedCents !== null) {
      throw conflict(
        ErrorCode.CONFLICT,
        'The bag has left: tell the courier at the door if you do not want it',
      );
    }
    if (decision === 'reject') {
      const storeId = checkoutRepo.storeOfOrder(order);
      if (sub.variantId) await checkoutRepo.lockInventory(tx, storeId, [sub.variantId]);
      await restoreOrderStock(tx, storeId, [lineStock(sub)]);
    }
    await tx.update(orderItems).set({ swapStatus: wanted }).where(eq(orderItems.id, sub.id));
    if (decision === 'reject') {
      // The original is back to what it was: short or missing, and nothing is charged for the gap.
      const original = items.find((i) => i.id === sub.substitutesItemId);
      if (original) {
        await tx
          .update(orderItems)
          .set({ pickStatus: original.pickedQty === 0 ? 'missing' : 'short' })
          .where(eq(orderItems.id, original.id));
      }
    }
    await checkoutRepo.insertHistory(tx, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: order.status,
      actor: owner ? 'customer' : 'customer:email-link',
      note: `Replacement for ${items.find((i) => i.id === sub.substitutesItemId)?.productName ?? 'an item'} ${wanted}`,
    });
    return { orderNumber, itemId, swapStatus: wanted };
  });
}

/**
 * Dispatch (and the capture) settle what nobody answered: an unanswered swap counts as accepted.
 * Runs in the caller's transaction, which holds the order lock. Returns how many it accepted.
 */
export async function acceptUnanswered(tx: Tx, orderId: string): Promise<number> {
  const rows = await tx
    .update(orderItems)
    .set({ swapStatus: 'accepted' })
    .where(
      and(
        eq(orderItems.orderId, orderId),
        isNotNull(orderItems.substitutesItemId),
        eq(orderItems.swapStatus, 'proposed'),
      ),
    )
    .returning({ id: orderItems.id });
  return rows.length;
}
