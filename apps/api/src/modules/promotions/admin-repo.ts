import { asc, count, desc, eq, isNull, and, sql } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import {
  bulkTiers,
  discountCodes,
  discountRedemptions,
  giftRules,
  productVariants,
  products,
} from '../../db/schema/index.ts';

// Admin-side queries for the promotion rules. The shopper-facing reads live in repo.ts.

export type CodeValues = Omit<
  typeof discountCodes.$inferInsert,
  'id' | 'createdAt' | 'updatedAt' | 'archivedAt' | 'ownerUserId'
>;

const liveRedemptions = sql<number>`(
  select count(*)::int from ${discountRedemptions}
  where ${discountRedemptions.codeId} = ${discountCodes.id} and ${discountRedemptions.releasedAt} is null
)`;

const codeColumns = {
  id: discountCodes.id,
  code: discountCodes.code,
  kind: discountCodes.kind,
  value: discountCodes.value,
  minSpendCents: discountCodes.minSpendCents,
  startsAt: discountCodes.startsAt,
  endsAt: discountCodes.endsAt,
  maxUses: discountCodes.maxUses,
  perCustomerMax: discountCodes.perCustomerMax,
  excludeSaleItems: discountCodes.excludeSaleItems,
  firstOrderOnly: discountCodes.firstOrderOnly,
  active: discountCodes.active,
  archivedAt: discountCodes.archivedAt,
  createdAt: discountCodes.createdAt,
  liveRedemptions,
};

export const listCodes = () =>
  db.select(codeColumns).from(discountCodes).orderBy(desc(discountCodes.createdAt));

export async function getCode(id: string) {
  const [row] = await db.select(codeColumns).from(discountCodes).where(eq(discountCodes.id, id));
  return row;
}

export async function insertCode(values: CodeValues) {
  const [row] = await db.insert(discountCodes).values(values).returning({ id: discountCodes.id });
  return row!.id;
}

export async function updateCode(id: string, values: CodeValues) {
  const rows = await db
    .update(discountCodes)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(discountCodes.id, id))
    .returning({ id: discountCodes.id });
  return rows.length > 0;
}

// Any redemption row at all, released or not: an order still points at the code.
export async function redemptionRows(codeId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(discountRedemptions)
    .where(eq(discountRedemptions.codeId, codeId));
  return row?.n ?? 0;
}

export async function archiveCode(id: string) {
  await db
    .update(discountCodes)
    .set({ archivedAt: new Date(), active: false, updatedAt: new Date() })
    .where(and(eq(discountCodes.id, id), isNull(discountCodes.archivedAt)));
}

export async function deleteCode(id: string) {
  await db.delete(discountCodes).where(eq(discountCodes.id, id));
}

// ----- tiers -----
export const listTiers = () => db.select().from(bulkTiers).orderBy(asc(bulkTiers.minCents));

export async function insertTier(values: { minCents: number; percent: number; active: boolean }) {
  const [row] = await db.insert(bulkTiers).values(values).returning();
  return row!;
}

export async function updateTier(
  id: string,
  values: { minCents: number; percent: number; active: boolean },
) {
  const [row] = await db
    .update(bulkTiers)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(bulkTiers.id, id))
    .returning();
  return row;
}

export async function deleteTier(id: string) {
  const rows = await db
    .delete(bulkTiers)
    .where(eq(bulkTiers.id, id))
    .returning({ id: bulkTiers.id });
  return rows.length > 0;
}

// ----- gift -----
const giftColumns = {
  id: giftRules.id,
  thresholdCents: giftRules.thresholdCents,
  variantId: giftRules.variantId,
  sku: productVariants.sku,
  productName: products.name,
  variantName: productVariants.name,
};

export async function activeGiftRule() {
  const [row] = await db
    .select(giftColumns)
    .from(giftRules)
    .innerJoin(productVariants, eq(productVariants.id, giftRules.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(giftRules.active, true));
  return row;
}

export async function findVariant(by: { id: string } | { sku: string }) {
  const [row] = await db
    .select({
      id: productVariants.id,
      status: productVariants.status,
      productStatus: products.status,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where('id' in by ? eq(productVariants.id, by.id) : eq(productVariants.sku, by.sku));
  return row;
}

// Updates the one active rule, or creates it. The partial unique index decides a race.
export async function setGiftRule(thresholdCents: number, variantId: string) {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: giftRules.id })
      .from(giftRules)
      .where(eq(giftRules.active, true))
      .for('update');
    if (current) {
      await tx
        .update(giftRules)
        .set({ thresholdCents, variantId, updatedAt: new Date() })
        .where(eq(giftRules.id, current.id));
    } else {
      await tx.insert(giftRules).values({ thresholdCents, variantId, active: true });
    }
  });
}

// Switching off removes the row: an off rule would still RESTRICT deleting its variant, and
// orders keep the gift as copied values, not a reference.
export async function clearGiftRule() {
  const rows = await db
    .delete(giftRules)
    .where(eq(giftRules.active, true))
    .returning({ id: giftRules.id });
  return rows.length;
}
