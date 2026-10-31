import { and, count, eq, gte, inArray, lte, ne, sql, sum } from 'drizzle-orm';

import { db } from '../../../db/client.ts';
import { inventory, orders, productVariants, products } from '../../../db/schema/index.ts';

// Orders that stand as revenue: paid and not (yet) undone.
const REVENUE_STATUSES = ['paid', 'processing', 'shipped', 'delivered'] as const;

export async function countOrdersPlacedSince(since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(gte(orders.placedAt, since), ne(orders.status, 'pending_payment')));
  return row?.n ?? 0;
}

export async function revenueSince(since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sum(orders.totalCents) })
    .from(orders)
    .where(and(gte(orders.placedAt, since), inArray(orders.status, [...REVENUE_STATUSES])));
  // `sum` comes back as a string (bigint-safe) or null for no rows.
  return Number(row?.total ?? 0);
}

// "Low" is judged on what can actually be sold (quantity - reserved), for variants and products
// that are on sale; an archived product running out of stock is not an alert.
export async function countLowStock(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(inventory)
    .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(productVariants.status, 'active'),
        ne(products.status, 'archived'),
        lte(sql`${inventory.quantity} - ${inventory.reserved}`, inventory.lowStockThreshold),
      ),
    );
  return row?.n ?? 0;
}

export async function shopCurrency(): Promise<string> {
  const [row] = await db.select({ currency: orders.currency }).from(orders).limit(1);
  return row?.currency ?? 'EUR';
}
