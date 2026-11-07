import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import {
  bulkTiers,
  discountCodes,
  discountRedemptions,
  giftRules,
  inventory,
  orders,
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
export async function countRedemptions(
  run: Run,
  codeId: string,
  customerKey: string,
): Promise<{ total: number; mine: number }> {
  const live = and(eq(discountRedemptions.codeId, codeId), isNull(discountRedemptions.releasedAt));
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
