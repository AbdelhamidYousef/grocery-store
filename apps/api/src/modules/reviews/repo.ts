import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import {
  orderItems,
  orders,
  productVariants,
  products,
  reviewPhotos,
  reviews,
  type orderStatus,
} from '../../db/schema/index.ts';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PaidStatus = (typeof orderStatus.enumValues)[number];

export async function findActiveProduct(slug: string) {
  const [row] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, 'active')));
  return row;
}

// The newest order of this user that contains any variant of the product and whose status is
// "paid or later". The statuses come from the shared `isPaidOrLater`, so a status added later is
// classified in one place.
export async function findPaidOrderId(
  userId: string,
  productId: string,
  paidStatuses: PaidStatus[],
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(productVariants.productId, productId),
        inArray(orders.status, paidStatuses),
      ),
    )
    .orderBy(sql`${orders.placedAt} desc nulls last`)
    .limit(1);
  return row?.id;
}

export type NewReview = typeof reviews.$inferInsert;

export async function insertReview(tx: Tx, values: NewReview) {
  const [row] = await tx.insert(reviews).values(values).returning();
  if (!row) throw new Error('insert of review returned no row');
  return row;
}

export async function insertPhotos(tx: Tx, reviewId: string, paths: string[]) {
  await tx
    .insert(reviewPhotos)
    .values(paths.map((path, position) => ({ reviewId, path, position })));
}
