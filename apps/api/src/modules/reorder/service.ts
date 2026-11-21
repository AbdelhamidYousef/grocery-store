import {
  BUY_AGAIN_LIMIT,
  ErrorCode,
  USUALS_LIMIT,
  USUALS_MIN_ORDERS,
  USUALS_ORDER_WINDOW,
  type BuyAgainItem,
  type ReorderResult,
  type Usuals,
} from '@store/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';

import { inventoryAt, stockQuantity, stockReserved } from '../../db/available.ts';
import { db } from '../../db/client.ts';
import {
  inventory,
  orderItems,
  orders,
  productImages,
  productVariants,
  products,
} from '../../db/schema/index.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { getOrCreateUserCart } from '../cart/identity.ts';
import * as cart from '../cart/service.ts';
import { currentStore } from '../i18n/context.ts';
import { hasPriceIn, priceIn } from '../i18n/prices.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Paid or later", the same statuses the rest of loyalty uses.
const PAID = ['paid', 'processing', 'shipped', 'delivered', 'refunded'] as const;
// A function, not a constant: the store is the one of the request in flight, read when the query is built.
const availableOf = () =>
  sql<number>`coalesce(${stockQuantity(productVariants.id)} - ${stockReserved(productVariants.id)}, 0)`;

// Distinct variants from this customer's paid orders, newest first, each with today's price and
// availability. A variant or product that is gone or archived is left out: you cannot buy it again.
export async function buyAgain(userId: string): Promise<BuyAgainItem[]> {
  const rows = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      slug: products.slug,
      name: products.name,
      variantName: productVariants.name,
      priceCents: priceIn(),
      currency: sql<string>`${currentStore().currency}::char(3)`,
      available: availableOf(),
      lastBoughtAt: sql<Date>`max(${orders.createdAt})`,
      timesBought: sql<number>`count(distinct ${orders.id})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, inventoryAt(productVariants.id))
    .where(
      and(
        eq(orders.userId, userId),
        inArray(orders.status, PAID),
        isNotNull(orderItems.variantId),
        eq(productVariants.status, 'active'),
        eq(products.status, 'active'),
        hasPriceIn(),
      ),
    )
    .groupBy(
      productVariants.id,
      products.id,
      inventory.variantId,
      inventory.quantity,
      inventory.reserved,
    )
    .orderBy(desc(sql`max(${orders.createdAt})`), asc(productVariants.id))
    .limit(BUY_AGAIN_LIMIT);
  return withImages(rows);
}

type ItemRow = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantName: string;
  priceCents: number;
  currency: string;
  available: number;
  lastBoughtAt: Date;
  timesBought: number;
};

// Adds each row's picture (the variant's own, else the product's) and turns it into the wire item.
async function withImages(rows: ItemRow[]): Promise<BuyAgainItem[]> {
  if (rows.length === 0) return [];
  const images = await db
    .select()
    .from(productImages)
    .where(
      inArray(
        productImages.productId,
        rows.map((r) => r.productId),
      ),
    )
    .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));
  return rows.map((r) => {
    const img =
      images.find((i) => i.variantId === r.variantId) ??
      images.find((i) => i.productId === r.productId && i.variantId === null) ??
      images.find((i) => i.productId === r.productId);
    return {
      variantId: r.variantId,
      productId: r.productId,
      slug: r.slug,
      name: r.name,
      variantName: r.variantName,
      image: img ? { url: img.url, alt: img.alt, width: img.width, height: img.height } : null,
      priceCents: r.priceCents,
      currency: r.currency,
      available: r.available > 0,
      lastBoughtAt: new Date(r.lastBoughtAt).toISOString(),
      timesBought: r.timesBought,
    };
  });
}

// "Your usuals": the variants this customer bought in at least USUALS_MIN_ORDERS of their last
// USUALS_ORDER_WINDOW paid orders, most often first (ties: the most recent purchase, then the id so
// the order never flickers), and only those in stock at the shopper's store right now. Nothing is
// guessed: the same orders always give the same list. `lastOrder` is the basket "Reorder last
// basket" repeats.
export async function usuals(userId: string): Promise<Usuals> {
  const recent = await db
    .select({ id: orders.id, number: orders.number, createdAt: orders.createdAt })
    .from(orders)
    .where(and(eq(orders.userId, userId), inArray(orders.status, PAID)))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(USUALS_ORDER_WINDOW);
  const last = recent[0];
  const lastOrder = last
    ? { number: last.number, placedAt: new Date(last.createdAt).toISOString() }
    : null;
  if (recent.length < USUALS_MIN_ORDERS) return { items: [], lastOrder };

  const rows = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      slug: products.slug,
      name: products.name,
      variantName: productVariants.name,
      priceCents: priceIn(),
      currency: sql<string>`${currentStore().currency}::char(3)`,
      available: availableOf(),
      lastBoughtAt: sql<Date>`max(${orders.createdAt})`,
      timesBought: sql<number>`count(distinct ${orders.id})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, inventoryAt(productVariants.id))
    .where(
      and(
        inArray(
          orders.id,
          recent.map((o) => o.id),
        ),
        // A replacement the packer added is not something the shopper chose: only their own lines.
        isNull(orderItems.substitutesItemId),
        isNotNull(orderItems.variantId),
        eq(productVariants.status, 'active'),
        eq(products.status, 'active'),
        hasPriceIn(),
      ),
    )
    .groupBy(
      productVariants.id,
      products.id,
      inventory.variantId,
      inventory.quantity,
      inventory.reserved,
    )
    .having(sql`count(distinct ${orders.id}) >= ${USUALS_MIN_ORDERS} and ${availableOf()} > 0`)
    .orderBy(
      desc(sql`count(distinct ${orders.id})`),
      desc(sql`max(${orders.createdAt})`),
      asc(productVariants.id),
    )
    .limit(USUALS_LIMIT);
  return { items: await withImages(rows), lastOrder };
}

// Puts a past order's lines back in the cart through the ordinary cart service, so stock, trial and
// kit rules are exactly the ones a shopper hits by hand. Each line is tried on its own: what cannot
// be added is reported (not silently dropped, and not fatal for the lines that can).
export async function reorder(userId: string, orderRef: string): Promise<ReorderResult> {
  // The account area names orders by number (GR-2026-000123), the API contract by id: accept both.
  const byRef = UUID.test(orderRef) ? eq(orders.id, orderRef) : eq(orders.number, orderRef);
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(byRef, eq(orders.userId, userId), ne(orders.status, 'pending_payment')));
  if (!order) throw notFound('Order not found');
  const orderId = order.id;
  const lines = await db
    .select({
      variantId: orderItems.variantId,
      quantity: orderItems.quantity,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.id));

  const cartRow = await getOrCreateUserCart(userId);
  const result: Omit<ReorderResult, 'cart'> = { added: [], skipped: [] };
  for (const line of lines) {
    const label = { name: line.productName, variantName: line.variantName };
    if (!line.variantId) {
      result.skipped.push({ ...label, reason: 'unavailable' });
      continue;
    }
    try {
      await cart.addItem(cartRow.id, line.variantId, line.quantity);
      result.added.push({ ...label, quantity: line.quantity });
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      result.skipped.push({
        ...label,
        reason:
          err.code === ErrorCode.OUT_OF_STOCK
            ? 'sold_out'
            : err.code === ErrorCode.TRIAL_LIMIT
              ? 'limit'
              : 'unavailable',
      });
    }
  }
  return { cart: await cart.getCart(cartRow.id), ...result };
}
