import { and, asc, count, eq, gte, inArray, lte, ne, sql, sum } from 'drizzle-orm';

import { db } from '../../../db/client.ts';
import {
  darkStores,
  inventory,
  orders,
  productVariants,
  products,
} from '../../../db/schema/index.ts';

// Orders that stand as revenue: paid and not (yet) undone.
const REVENUE_STATUSES = ['paid', 'processing', 'shipped', 'delivered'] as const;

export async function countOrdersPlacedSince(since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(gte(orders.placedAt, since), ne(orders.status, 'pending_payment')));
  return row?.n ?? 0;
}

export async function revenueSince(since: Date, currency: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(orders.totalCents) })
    .from(orders)
    .where(
      and(
        gte(orders.placedAt, since),
        eq(orders.currency, currency),
        inArray(orders.status, [...REVENUE_STATUSES]),
      ),
    );
  // `sum` comes back as a string (bigint-safe) or null for no rows.
  return Number(row?.total ?? 0);
}

// "Low" is judged on what can actually be sold (quantity - reserved), for variants and products
// that are on sale; an archived product running out of stock is not an alert. Counted per shelf
// (store x variant), and split by store; a store with nothing low is still listed with 0.
export async function countLowStockByStore() {
  const low = and(
    eq(productVariants.status, 'active'),
    ne(products.status, 'archived'),
    lte(sql`${inventory.quantity} - ${inventory.reserved}`, inventory.lowStockThreshold),
  );
  const rows = await db
    .select({
      storeSlug: darkStores.slug,
      storeName: darkStores.name,
      n: sql<number>`count(${productVariants.id}) filter (where ${low})::int`,
    })
    .from(darkStores)
    .leftJoin(inventory, eq(inventory.storeId, darkStores.id))
    .leftJoin(productVariants, eq(productVariants.id, inventory.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .groupBy(darkStores.id, darkStores.slug, darkStores.name)
    .orderBy(asc(darkStores.name));
  return rows.map((r) => ({ storeSlug: r.storeSlug, storeName: r.storeName, count: r.n }));
}
