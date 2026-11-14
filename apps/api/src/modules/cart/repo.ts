import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import { stockQuantity, stockReserved } from '../../db/available.ts';
import { db, type Tx } from '../../db/client.ts';
import {
  cartItems,
  carts,
  inventory,
  productImages,
  productVariants,
  products,
} from '../../db/schema/index.ts';

export type CartRow = typeof carts.$inferSelect;
type Db = typeof db | Tx;

// Only a live guest cart qualifies: still `active`, owned by nobody, not expired. A cart that was
// merged, converted into an order, or now belongs to a user must never be reachable through a
// guest cookie, even a correctly signed one.
export async function findLiveGuestCart(id: string, run: Db = db): Promise<CartRow | undefined> {
  const [row] = await run
    .select()
    .from(carts)
    .where(
      and(
        eq(carts.id, id),
        isNull(carts.userId),
        eq(carts.status, 'active'),
        gt(carts.expiresAt, new Date()),
      ),
    );
  return row;
}

export async function findActiveUserCart(
  userId: string,
  run: Db = db,
): Promise<CartRow | undefined> {
  const [row] = await run
    .select()
    .from(carts)
    .where(and(eq(carts.userId, userId), eq(carts.status, 'active')));
  return row;
}

export async function insertGuestCart(expiresAt: Date, run: Db = db): Promise<CartRow> {
  const [row] = await run.insert(carts).values({ userId: null, expiresAt }).returning();
  if (!row) throw new Error('cart insert returned no row');
  return row;
}

// `ON CONFLICT DO NOTHING` (no target) absorbs the partial unique index "one active cart per
// user": when two requests race to create the first cart, the loser gets no row back and reads
// the winner's instead of failing.
export async function insertUserCartIfAbsent(
  userId: string,
  expiresAt: Date,
  run: Db = db,
): Promise<CartRow | undefined> {
  const [row] = await run
    .insert(carts)
    .values({ userId, expiresAt })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function markStatus(
  id: string,
  status: 'merged' | 'abandoned' | 'converted',
  run: Db = db,
): Promise<void> {
  await run.update(carts).set({ status }).where(eq(carts.id, id));
}

// ---------- lines ----------

// Serialises everything that touches one cart (reads that repair, adds, merges): the row lock is
// held until the surrounding transaction ends. Must be called inside `db.transaction`.
export async function lockCart(tx: Tx, cartId: string): Promise<CartRow | undefined> {
  const [row] = await tx.select().from(carts).where(eq(carts.id, cartId)).for('update');
  return row;
}

export type LineRow = {
  itemId: string;
  quantity: number;
  variantId: string;
  variantName: string;
  sku: string;
  priceCents: number;
  lastSeenPriceCents: number | null;
  currency: string;
  weightGrams: number;
  isTrial: boolean;
  // A kit: priced as a fixed price (no sale/member price, no order discounts or codes).
  isBundle: boolean;
  variantStatus: 'draft' | 'active' | 'archived';
  productId: string;
  productName: string;
  productSlug: string;
  productStatus: 'draft' | 'active' | 'archived';
  stock: number | null;
  reserved: number | null;
};

// One query joins everything a priced line needs. `inventory` is a LEFT join so a variant that
// somehow has no stock row reads as sold out instead of vanishing from the cart.
export async function listLines(tx: Tx, cartId: string): Promise<LineRow[]> {
  return (
    tx
      .select({
        itemId: cartItems.id,
        quantity: cartItems.quantity,
        variantId: productVariants.id,
        variantName: productVariants.name,
        sku: productVariants.sku,
        priceCents: productVariants.priceCents,
        lastSeenPriceCents: cartItems.lastSeenPriceCents,
        currency: productVariants.currency,
        weightGrams: productVariants.weightGrams,
        isTrial: productVariants.isTrial,
        isBundle: sql<boolean>`exists (select 1 from bundle_items where bundle_variant_id = ${productVariants.id})`,
        variantStatus: productVariants.status,
        productId: products.id,
        productName: products.name,
        productSlug: products.slug,
        productStatus: products.status,
        stock: stockQuantity(productVariants.id),
        reserved: stockReserved(productVariants.id),
      })
      .from(cartItems)
      .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(cartItems.cartId, cartId))
      // Stable order: the lines do not jump around when one is edited.
      .orderBy(asc(cartItems.createdAt), asc(cartItems.id))
  );
}

export type ImageRow = {
  productId: string;
  variantId: string | null;
  url: string;
  alt: string;
};

export async function listImages(tx: Tx, productIds: string[]): Promise<ImageRow[]> {
  if (productIds.length === 0) return [];
  return tx
    .select({
      productId: productImages.productId,
      variantId: productImages.variantId,
      url: productImages.url,
      alt: productImages.alt,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sortOrder), asc(productImages.id));
}

// `lastSeenPriceCents` is passed when the shopper just acted on the line (add / quantity change):
// they are looking at the current price at that moment, so it becomes the remembered one. The
// automatic clamp in `loadCart` omits it, because the shopper has not seen anything new there.
export async function setItemQuantity(
  tx: Tx,
  itemId: string,
  quantity: number,
  lastSeenPriceCents?: number,
): Promise<void> {
  await tx
    .update(cartItems)
    .set({ quantity, ...(lastSeenPriceCents !== undefined && { lastSeenPriceCents }) })
    .where(eq(cartItems.id, itemId));
}

export async function setLastSeenPrice(
  tx: Tx,
  itemId: string,
  lastSeenPriceCents: number,
): Promise<void> {
  await tx.update(cartItems).set({ lastSeenPriceCents }).where(eq(cartItems.id, itemId));
}

export async function deleteItems(tx: Tx, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await tx.delete(cartItems).where(inArray(cartItems.id, itemIds));
}

// ---------- mutations ----------

export type CartItemRow = typeof cartItems.$inferSelect;

export async function findItemInCart(
  tx: Tx,
  cartId: string,
  itemId: string,
): Promise<CartItemRow | undefined> {
  // Both ids in the WHERE: the item id comes from the URL, the cart id from the caller's identity.
  // An item that exists in someone else's cart is therefore simply "not found".
  const [row] = await tx
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
  return row;
}

export async function findItemByVariant(
  tx: Tx,
  cartId: string,
  variantId: string,
): Promise<CartItemRow | undefined> {
  const [row] = await tx
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
  return row;
}

// What a shopper may buy of one variant right now. Undefined when the variant (or its product) is
// not on sale, which callers report as "not found", not as "out of stock".
export async function findPurchasable(
  tx: Tx,
  variantId: string,
): Promise<{ available: number; priceCents: number; isTrial: boolean } | undefined> {
  const [row] = await tx
    .select({
      stock: stockQuantity(productVariants.id),
      reserved: stockReserved(productVariants.id),
      priceCents: productVariants.priceCents,
      isTrial: productVariants.isTrial,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.status, 'active'),
        eq(products.status, 'active'),
      ),
    );
  if (!row) return undefined;
  return {
    available: Math.max(0, (row.stock ?? 0) - (row.reserved ?? 0)),
    priceCents: row.priceCents,
    isTrial: row.isTrial,
  };
}

export async function insertItem(
  tx: Tx,
  cartId: string,
  variantId: string,
  quantity: number,
  lastSeenPriceCents: number | null,
): Promise<void> {
  await tx.insert(cartItems).values({ cartId, variantId, quantity, lastSeenPriceCents });
}

export async function deleteAllItems(tx: Tx, cartId: string): Promise<void> {
  await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

// A cart that is being used stays alive: guests another 30 days, users another 90.
export async function setExpiry(tx: Tx, cartId: string, expiresAt: Date): Promise<void> {
  await tx.update(carts).set({ expiresAt }).where(eq(carts.id, cartId));
}

export async function listItems(tx: Tx, cartId: string): Promise<CartItemRow[]> {
  // Oldest first, then id: the merge visits lines in a fixed order, so its outcome is repeatable.
  return tx
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id));
}

export async function setDiscountCode(tx: Tx, cartId: string, code: string | null): Promise<void> {
  await tx.update(carts).set({ discountCode: code }).where(eq(carts.id, cartId));
}
