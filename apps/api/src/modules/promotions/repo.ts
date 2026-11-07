import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import {
  bulkTiers,
  discountCodes,
  discountRedemptions,
  giftRules,
  inventory,
  orderPromotions,
  orders,
  payments,
  productImages,
  productVariants,
  products,
} from '../../db/schema/index.ts';

type Run = typeof db | Tx;

export type CodeRow = typeof discountCodes.$inferSelect;

export async function findCode(run: Run, code: string): Promise<CodeRow | undefined> {
  // citext: matches whatever case the shopper typed.
  const [row] = await run.select().from(discountCodes).where(eq(discountCodes.code, code));
  return row;
}

// Locks the code row so two checkouts racing for the last use of a capped code queue up: the
// second one counts the first one's redemption.
export async function lockCode(tx: Tx, id: string): Promise<CodeRow | undefined> {
  const [row] = await tx.select().from(discountCodes).where(eq(discountCodes.id, id)).for('update');
  return row;
}

export async function activeTiers(run: Run) {
  return run
    .select({ id: bulkTiers.id, minCents: bulkTiers.minCents, percent: bulkTiers.percent })
    .from(bulkTiers)
    .where(eq(bulkTiers.active, true))
    .orderBy(asc(bulkTiers.minCents));
}

// The active gift rule with what the cart needs to show the gift, and whether one can be given:
// the variant and product must be on sale and at least one unit free to reserve.
export async function activeGift(run: Run) {
  const [row] = await run
    .select({
      id: giftRules.id,
      thresholdCents: giftRules.thresholdCents,
      variantId: giftRules.variantId,
      productId: products.id,
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
      priceCents: productVariants.priceCents,
      variantStatus: productVariants.status,
      productStatus: products.status,
      stock: inventory.quantity,
      reserved: inventory.reserved,
    })
    .from(giftRules)
    .innerJoin(productVariants, eq(productVariants.id, giftRules.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, giftRules.variantId))
    .where(eq(giftRules.active, true))
    .limit(1);
  if (!row) return undefined;
  const [image] = await run
    .select({ url: productImages.url })
    .from(productImages)
    .where(eq(productImages.productId, row.productId))
    .orderBy(asc(productImages.sortOrder))
    .limit(1);
  const available =
    row.variantStatus === 'active' &&
    row.productStatus === 'active' &&
    (row.stock ?? 0) - (row.reserved ?? 0) > 0;
  return { ...row, available, imageUrl: image?.url ?? null };
}

// Live (not released) redemptions of a code, in total and for one customer.
// `exceptOrderId`: a pending order being re-placed (a second "pay" click) must not count its own
// earlier redemption against the cap.
export async function countRedemptions(
  run: Run,
  codeId: string,
  customerKey: string,
  exceptOrderId?: string,
): Promise<{ total: number; mine: number }> {
  const live = and(
    eq(discountRedemptions.codeId, codeId),
    isNull(discountRedemptions.releasedAt),
    exceptOrderId ? ne(discountRedemptions.orderId, exceptOrderId) : undefined,
  );
  const [total] = await run.select({ n: count() }).from(discountRedemptions).where(live);
  const [mine] = await run
    .select({ n: count() })
    .from(discountRedemptions)
    .where(and(live, eq(discountRedemptions.customerKey, customerKey)));
  return { total: total?.n ?? 0, mine: mine?.n ?? 0 };
}

const PLACED = ['paid', 'processing', 'shipped', 'delivered'] as const;

// Orders the customer has really placed (paid at some point), for first-order-only codes.
export async function countPlacedOrders(run: Run, userId: string | null, email: string | null) {
  const who = userId ? eq(orders.userId, userId) : email ? eq(orders.email, email) : undefined;
  if (!who) return 0;
  const [row] = await run
    .select({ n: count() })
    .from(orders)
    .where(and(who, inArray(orders.status, [...PLACED])));
  return row?.n ?? 0;
}

export async function activeGiftVariantId(run: Run): Promise<string | undefined> {
  const [row] = await run
    .select({ variantId: giftRules.variantId })
    .from(giftRules)
    .where(eq(giftRules.active, true))
    .limit(1);
  return row?.variantId;
}

// ---------- order snapshot ----------

export async function replaceOrderPromotions(
  tx: Tx,
  orderId: string,
  rows: Omit<typeof orderPromotions.$inferInsert, 'orderId'>[],
): Promise<void> {
  await tx.delete(orderPromotions).where(eq(orderPromotions.orderId, orderId));
  if (rows.length > 0) {
    await tx.insert(orderPromotions).values(rows.map((r) => ({ ...r, orderId })));
  }
}

export async function listOrderPromotions(run: Run, orderId: string) {
  return run
    .select()
    .from(orderPromotions)
    .where(eq(orderPromotions.orderId, orderId))
    .orderBy(asc(orderPromotions.createdAt), asc(orderPromotions.id));
}

// The order's redemption, rewritten with the order: none if the code no longer applies.
export async function replaceRedemption(
  tx: Tx,
  orderId: string,
  redemption: { codeId: string; customerKey: string } | null,
): Promise<void> {
  await tx.delete(discountRedemptions).where(eq(discountRedemptions.orderId, orderId));
  if (redemption) await tx.insert(discountRedemptions).values({ ...redemption, orderId });
}

export async function releaseRedemptions(tx: Tx, orderId: string): Promise<void> {
  await tx
    .update(discountRedemptions)
    .set({ releasedAt: new Date() })
    .where(and(eq(discountRedemptions.orderId, orderId), isNull(discountRedemptions.releasedAt)));
}

export async function wasPaid(run: Run, orderId: string): Promise<boolean> {
  const [row] = await run
    .select({ n: count() })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, 'succeeded')));
  return (row?.n ?? 0) > 0;
}
