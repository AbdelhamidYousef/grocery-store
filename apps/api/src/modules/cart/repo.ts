import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';

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
  status: 'merged' | 'abandoned',
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
  currency: string;
  weightGrams: number;
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
        currency: productVariants.currency,
        weightGrams: productVariants.weightGrams,
        variantStatus: productVariants.status,
        productId: products.id,
        productName: products.name,
        productSlug: products.slug,
        productStatus: products.status,
        stock: inventory.quantity,
        reserved: inventory.reserved,
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

export async function setItemQuantity(tx: Tx, itemId: string, quantity: number): Promise<void> {
  await tx.update(cartItems).set({ quantity }).where(eq(cartItems.id, itemId));
}

export async function deleteItems(tx: Tx, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await tx.delete(cartItems).where(inArray(cartItems.id, itemIds));
}
