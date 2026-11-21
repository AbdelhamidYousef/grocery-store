import {
  ErrorCode,
  LISTS_MAX,
  WISHLIST_MAX_ITEMS,
  type ListDetail,
  type ListSummary,
  type ReorderResult,
} from '@store/shared';
import { and, asc, count, eq, sql } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import { productVariants, products, wishlistItems, wishlists } from '../../db/schema/index.ts';
import { uniqueViolation } from '../../lib/db-errors.ts';
import { AppError, conflict, notFound } from '../../lib/errors.ts';
import { getOrCreateUserCart } from '../cart/identity.ts';
import * as cart from '../cart/service.ts';
import { resolveList, viewItems } from '../wishlist/service.ts';

// Named shopping lists. A list is a `wishlists` row of a user (the default one is the old wishlist,
// "Saved"), its items are `wishlist_items` with a quantity. Every function takes the SESSION's user id
// and loads the list by (id, user): somebody else's list is a plain 404.

type Run = typeof db | Tx;

async function ownList(run: Run, userId: string, listId: string) {
  const [row] = await run
    .select()
    .from(wishlists)
    .where(and(eq(wishlists.id, listId), eq(wishlists.userId, userId)));
  if (!row) throw notFound('List not found');
  return row;
}

const summaryOf = async (run: Run, row: typeof wishlists.$inferSelect): Promise<ListSummary> => {
  const [n] = await run
    .select({ n: count() })
    .from(wishlistItems)
    .where(eq(wishlistItems.wishlistId, row.id));
  return { id: row.id, name: row.name, isDefault: row.isDefault, itemCount: n?.n ?? 0 };
};

/** The shopper's lists, "Saved" first, the rest oldest first. Creates "Saved" on first use. */
export async function listsOf(userId: string): Promise<ListSummary[]> {
  await resolveList(db, { userId, guestWishlistId: null });
  const rows = await db
    .select({
      id: wishlists.id,
      name: wishlists.name,
      isDefault: wishlists.isDefault,
      // "wishlists"."id" is written out: drizzle prints a single-table column unqualified, which would
      itemCount:
        // read the inner row's own id.
        sql<number>`(select count(*)::int from wishlist_items i where i.wishlist_id = "wishlists"."id")`,
    })
    .from(wishlists)
    .where(eq(wishlists.userId, userId))
    .orderBy(sql`${wishlists.isDefault} desc`, asc(wishlists.createdAt), asc(wishlists.id));
  return rows;
}

export async function getList(userId: string, listId: string): Promise<ListDetail> {
  const row = await ownList(db, userId, listId);
  return { ...(await summaryOf(db, row)), items: await viewItems(db, row.id) };
}

export async function createList(userId: string, name: string): Promise<ListSummary> {
  return db
    .transaction(async (tx) => {
      // Lock the owner's rows by creating "Saved" first and counting under it: two creates at once
      // cannot both pass the cap.
      await resolveList(tx, { userId, guestWishlistId: null });
      await tx.execute(sql`select id from users where id = ${userId} for update`);
      const [n] = await tx
        .select({ n: count() })
        .from(wishlists)
        .where(eq(wishlists.userId, userId));
      if ((n?.n ?? 0) >= LISTS_MAX) {
        throw conflict(ErrorCode.CONFLICT, `You can have at most ${LISTS_MAX} lists`);
      }
      const [row] = await tx
        .insert(wishlists)
        .values({ userId, name, isDefault: false })
        .returning();
      return summaryOf(tx, row!);
    })
    .catch(nameTaken);
}

export async function renameList(
  userId: string,
  listId: string,
  name: string,
): Promise<ListSummary> {
  const row = await ownList(db, userId, listId);
  if (row.isDefault) {
    throw conflict(ErrorCode.CONFLICT, '"Saved" is your default list: it keeps its name');
  }
  await db
    .update(wishlists)
    .set({ name, updatedAt: sql`now()` })
    .where(eq(wishlists.id, row.id))
    .catch(nameTaken);
  return summaryOf(db, await ownList(db, userId, listId));
}

export async function deleteList(userId: string, listId: string): Promise<void> {
  const row = await ownList(db, userId, listId);
  if (row.isDefault) {
    throw conflict(ErrorCode.CONFLICT, '"Saved" is your default list: it cannot be deleted');
  }
  await db.delete(wishlists).where(eq(wishlists.id, row.id));
}

// Two lists of one shopper cannot share a name (case aside): the unique index says so.
function nameTaken(err: unknown): never {
  if (uniqueViolation(err)?.includes('name')) {
    throw conflict(ErrorCode.CONFLICT, 'You already have a list with that name');
  }
  throw err;
}

export async function putItem(
  userId: string,
  listId: string,
  input: { productId: string; variantId?: string | undefined; quantity: number },
): Promise<ListDetail> {
  await db.transaction(async (tx) => {
    const list = await ownList(tx, userId, listId);
    const [p] = await tx
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(eq(products.id, input.productId));
    if (!p || p.status !== 'active') throw notFound('Product not found');
    if (input.variantId) {
      const [v] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, input.variantId),
            eq(productVariants.productId, input.productId),
          ),
        );
      if (!v) throw notFound('Variant not found');
    }
    const [n] = await tx
      .select({ n: count() })
      .from(wishlistItems)
      .where(eq(wishlistItems.wishlistId, list.id));
    const [existing] = await tx
      .select({ id: wishlistItems.id })
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.wishlistId, list.id),
          eq(wishlistItems.productId, input.productId),
          input.variantId
            ? eq(wishlistItems.variantId, input.variantId)
            : sql`${wishlistItems.variantId} is null`,
        ),
      );
    if (existing) {
      await tx
        .update(wishlistItems)
        .set({ quantity: input.quantity })
        .where(eq(wishlistItems.id, existing.id));
      return;
    }
    if ((n?.n ?? 0) >= WISHLIST_MAX_ITEMS) {
      throw conflict(ErrorCode.CONFLICT, `A list holds at most ${WISHLIST_MAX_ITEMS} items`);
    }
    await tx.insert(wishlistItems).values({
      wishlistId: list.id,
      productId: input.productId,
      variantId: input.variantId ?? null,
      quantity: input.quantity,
    });
  });
  return getList(userId, listId);
}

export async function setQuantity(
  userId: string,
  listId: string,
  itemId: string,
  quantity: number,
): Promise<ListDetail> {
  const list = await ownList(db, userId, listId);
  const updated = await db
    .update(wishlistItems)
    .set({ quantity })
    .where(and(eq(wishlistItems.id, itemId), eq(wishlistItems.wishlistId, list.id)))
    .returning({ id: wishlistItems.id });
  if (updated.length === 0) throw notFound('Item not found');
  return getList(userId, listId);
}

export async function removeItem(
  userId: string,
  listId: string,
  itemId: string,
): Promise<ListDetail> {
  const list = await ownList(db, userId, listId);
  await db
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.id, itemId), eq(wishlistItems.wishlistId, list.id)));
  return getList(userId, listId);
}

// "Add all to basket": every line goes through the ordinary cart service (stock at the shopper's store,
// trial limits, kits), each on its own, so what cannot go in is reported with its reason and never
// stops the rest. A line whose product has no sellable variant is "unavailable".
export async function addAllToCart(userId: string, listId: string): Promise<ReorderResult> {
  const list = await ownList(db, userId, listId);
  const lines = await viewItems(db, list.id);
  const quantities = new Map(
    (
      await db
        .select({ id: wishlistItems.id, quantity: wishlistItems.quantity })
        .from(wishlistItems)
        .where(eq(wishlistItems.wishlistId, list.id))
    ).map((r) => [r.id, r.quantity]),
  );
  const cartRow = await getOrCreateUserCart(userId);
  const result: Omit<ReorderResult, 'cart'> = { added: [], skipped: [] };
  for (const line of lines) {
    const label = { name: line.name, variantName: line.variantName ?? '' };
    const quantity = quantities.get(line.id) ?? 1;
    if (!line.variantId) {
      result.skipped.push({ ...label, reason: 'unavailable' });
      continue;
    }
    if (!line.available) {
      result.skipped.push({ ...label, reason: 'sold_out' });
      continue;
    }
    try {
      await cart.addItem(cartRow.id, line.variantId, quantity);
      result.added.push({ ...label, quantity });
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
