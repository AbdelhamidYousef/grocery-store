import { randomBytes } from 'node:crypto';

import {
  WISHLIST_MAX_ITEMS,
  type SharedWishlist,
  type Wishlist,
  type WishlistItem,
} from '@store/shared';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';

import { stockQuantity, stockReserved } from '../../db/available.ts';
import { db, type Tx } from '../../db/client.ts';
import {
  inventory,
  productImages,
  productVariants,
  products,
  users,
  wishlistItems,
  wishlists,
} from '../../db/schema/index.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import { currentStore } from '../i18n/context.ts';
import { hasPriceIn, priceIn } from '../i18n/prices.ts';

type Run = typeof db | Tx;
const token = (): string => randomBytes(24).toString('base64url');

export interface WishlistWho {
  userId: string | null;
  guestWishlistId: string | null;
}

// ---------- identity (the cart's approach) ----------
// Who owns the list is decided here from the session or the signed cookie, never from a client id.

async function findList(run: Run, who: WishlistWho) {
  if (who.userId) {
    const [row] = await run.select().from(wishlists).where(eq(wishlists.userId, who.userId));
    return row ?? null;
  }
  if (who.guestWishlistId) {
    const [row] = await run.select().from(wishlists).where(eq(wishlists.id, who.guestWishlistId));
    // a user's list is never reachable through a guest cookie
    return row && row.userId === null ? row : null;
  }
  return null;
}

export async function resolveList(run: Run, who: WishlistWho) {
  const found = await findList(run, who);
  if (found) return { list: found, created: false };
  const values = who.userId ? { userId: who.userId } : { guestToken: token() };
  const [made] = await run.insert(wishlists).values(values).onConflictDoNothing().returning();
  if (made) return { list: made, created: !who.userId };
  const again = await findList(run, who);
  if (!again) throw new Error('wishlist vanished during creation');
  return { list: again, created: false };
}

// ---------- reading ----------

const availableOf = sql<number>`coalesce(${stockQuantity(productVariants.id)} - ${stockReserved(productVariants.id)}, 0)`;

async function viewItems(run: Run, wishlistId: string): Promise<WishlistItem[]> {
  const rows = await run
    .select({
      id: wishlistItems.id,
      productId: products.id,
      slug: products.slug,
      name: products.name,
      status: products.status,
      savedVariantId: wishlistItems.variantId,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .where(eq(wishlistItems.wishlistId, wishlistId))
    .orderBy(asc(wishlistItems.createdAt), asc(wishlistItems.id));
  const live = rows.filter((r) => r.status === 'active');
  if (live.length === 0) return [];

  const productIds = live.map((r) => r.productId);
  const variants = await run
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      name: productVariants.name,
      priceCents: priceIn(),
      currency: sql<string>`${currentStore().currency}::char(3)`,
      isDefault: productVariants.isDefault,
      available: availableOf,
    })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(
      and(
        inArray(productVariants.productId, productIds),
        eq(productVariants.status, 'active'),
        hasPriceIn(),
      ),
    )
    .orderBy(asc(priceIn()));
  const images = await run
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));

  return live.map((r): WishlistItem => {
    const mine = variants.filter((v) => v.productId === r.productId);
    // The saved variant if it is still sold; otherwise the default, or the first one in stock.
    const chosen =
      mine.find((v) => v.id === r.savedVariantId) ??
      mine.find((v) => v.isDefault && v.available > 0) ??
      mine.find((v) => v.available > 0) ??
      mine.find((v) => v.isDefault) ??
      mine[0];
    const img =
      images.find((i) => i.productId === r.productId && i.variantId === null) ??
      images.find((i) => i.productId === r.productId);
    return {
      id: r.id,
      productId: r.productId,
      slug: r.slug,
      name: r.name,
      image: img ? { url: img.url, alt: img.alt, width: img.width, height: img.height } : null,
      variantId: chosen?.id ?? null,
      variantName: chosen?.name ?? null,
      priceCents: chosen?.priceCents ?? null,
      currency: chosen?.currency ?? currentStore().currency,
      available: (chosen?.available ?? 0) > 0,
    };
  });
}

export async function getWishlist(who: WishlistWho): Promise<Wishlist> {
  const list = await findList(db, who);
  if (!list) return { items: [], shareToken: null };
  return { items: await viewItems(db, list.id), shareToken: list.shareToken };
}

// ---------- writing ----------

export async function addItem(
  who: WishlistWho,
  input: { productId: string; variantId?: string | undefined },
): Promise<{ wishlist: Wishlist; createdGuestListId: string | null }> {
  let createdGuestListId: string | null = null;
  await db.transaction(async (tx) => {
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
    const { list, created } = await resolveList(tx, who);
    if (created) createdGuestListId = list.id;
    const [n] = await tx
      .select({ n: count() })
      .from(wishlistItems)
      .where(eq(wishlistItems.wishlistId, list.id));
    const inserted = await tx
      .insert(wishlistItems)
      .values({
        wishlistId: list.id,
        productId: input.productId,
        variantId: input.variantId ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: wishlistItems.id });
    if (inserted.length > 0 && (n?.n ?? 0) >= WISHLIST_MAX_ITEMS) {
      throw conflict('CONFLICT', `A wishlist holds at most ${WISHLIST_MAX_ITEMS} items`);
    }
  });
  return {
    wishlist: await getWishlist(
      createdGuestListId ? { userId: null, guestWishlistId: createdGuestListId } : who,
    ),
    createdGuestListId,
  };
}

export async function removeItem(who: WishlistWho, itemId: string): Promise<Wishlist> {
  const list = await findList(db, who);
  if (list) {
    await db
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.id, itemId), eq(wishlistItems.wishlistId, list.id)));
  }
  return getWishlist(who);
}

// Sharing needs an account: the shared page shows the owner's first name, and a guest has none.
export async function setSharing(userId: string, on: boolean): Promise<Wishlist> {
  const { list } = await resolveList(db, { userId, guestWishlistId: null });
  if (on && !list.shareToken) {
    await db.update(wishlists).set({ shareToken: token() }).where(eq(wishlists.id, list.id));
  } else if (!on && list.shareToken) {
    await db.update(wishlists).set({ shareToken: null }).where(eq(wishlists.id, list.id));
  }
  return getWishlist({ userId, guestWishlistId: null });
}

// Public. A revoked or unknown token is the same 404, so a link that stopped working says nothing.
export async function getShared(shareToken: string): Promise<SharedWishlist> {
  const [row] = await db
    .select({ id: wishlists.id, firstName: users.firstName })
    .from(wishlists)
    .innerJoin(users, eq(users.id, wishlists.userId))
    .where(eq(wishlists.shareToken, shareToken));
  if (!row) throw notFound('This wishlist is not shared');
  return { ownerFirstName: row.firstName, items: await viewItems(db, row.id) };
}

// Login: the guest list's items move into the account's list, without duplicates, and the guest
// list is deleted. Same shape as the cart merge; a no-op for an unknown or foreign id.
export async function mergeGuestWishlist(guestListId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [guest] = await tx
      .select()
      .from(wishlists)
      .where(eq(wishlists.id, guestListId))
      .for('update');
    if (!guest || guest.userId !== null) return;
    const { list } = await resolveList(tx, { userId, guestWishlistId: null });
    await tx.execute(sql`
      insert into wishlist_items (wishlist_id, product_id, variant_id)
      select ${list.id}, product_id, variant_id from wishlist_items where wishlist_id = ${guest.id}
      on conflict do nothing`);
    await tx.delete(wishlists).where(eq(wishlists.id, guest.id));
  });
}
