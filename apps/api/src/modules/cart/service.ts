import {
  ErrorCode,
  MAX_LINE_QUANTITY,
  sumCents,
  type Cart,
  type CartItem,
  type CartWarning,
  type OutOfStockDetails,
} from '@store/shared';

import { db, type Tx } from '../../db/client.ts';
import { conflict, notFound } from '../../lib/errors.ts';

import { getOrCreateUserCart, guestExpiry, userExpiry } from './identity.ts';
import * as repo from './repo.ts';

// Store currency fallback for an empty cart (every variant defaults to it too).
const DEFAULT_CURRENCY = 'EUR';

// Picks the picture for a line: the variant's own image first (the red one, if it is red), then a
// general product image, then whatever the product has. `images` arrives sorted by sort_order.
function pickImage(images: repo.ImageRow[], line: repo.LineRow): repo.ImageRow | undefined {
  return (
    images.find((i) => i.productId === line.productId && i.variantId === line.variantId) ??
    images.find((i) => i.productId === line.productId && i.variantId === null) ??
    images.find((i) => i.productId === line.productId)
  );
}

// Builds the priced, stock-checked view of a cart and repairs the stored rows to match. Must run
// inside a transaction (the caller's, so a mutation can return its own result) because it takes
// the cart row lock: reading and repairing concurrently with an add could otherwise clamp a line
// against stale stock.
//
// Repairs are persisted, not just reported, so the cart converges: a clamped quantity stays
// clamped and an archived variant stays gone, and the warning is shown once (in the response that
// caused the repair), not forever.
export async function loadCart(tx: Tx, cartId: string): Promise<Cart> {
  await repo.lockCart(tx, cartId);
  const lines = await repo.listLines(tx, cartId);
  const images = await repo.listImages(tx, [...new Set(lines.map((l) => l.productId))]);

  const warnings: CartWarning[] = [];
  const removeIds: string[] = [];
  const items: CartItem[] = [];
  let weightGrams = 0;
  const purchasableLines: { total: number; qty: number }[] = [];

  for (const line of lines) {
    const base = {
      variantId: line.variantId,
      productName: line.productName,
      variantName: line.variantName,
    };

    // Archived (or draft) products and variants cannot be bought; drop the line and say so.
    if (line.variantStatus !== 'active' || line.productStatus !== 'active') {
      removeIds.push(line.itemId);
      warnings.push({ code: 'VARIANT_UNAVAILABLE', ...base });
      continue;
    }

    const available = Math.max(0, (line.stock ?? 0) - (line.reserved ?? 0));
    const maxQty = Math.min(MAX_LINE_QUANTITY, available);
    let quantity = line.quantity;

    if (available === 0) {
      // Kept (greyed out in the UI) rather than deleted: silently losing a line is worse than
      // showing it as sold out, and stock may come back.
      warnings.push({ code: 'OUT_OF_STOCK', ...base });
    } else if (quantity > maxQty) {
      warnings.push({ code: 'QTY_REDUCED', ...base, previousQuantity: quantity, quantity: maxQty });
      await repo.setItemQuantity(tx, line.itemId, maxQty);
      quantity = maxQty;
    }

    const image = pickImage(images, line);
    const lineTotal = line.priceCents * quantity;
    items.push({
      id: line.itemId,
      variantId: line.variantId,
      productId: line.productId,
      productName: line.productName,
      productSlug: line.productSlug,
      variantName: line.variantName,
      sku: line.sku,
      imageUrl: image?.url ?? null,
      imageAlt: image?.alt ?? null,
      unitPriceCents: line.priceCents,
      quantity,
      lineTotalCents: lineTotal,
      available,
      maxQty,
    });

    // Sold-out lines are shown but never counted: the subtotal is what can actually be bought.
    if (available > 0) {
      purchasableLines.push({ total: lineTotal, qty: quantity });
      weightGrams += line.weightGrams * quantity;
    }
  }

  await repo.deleteItems(tx, removeIds);

  return {
    items,
    currency: lines[0]?.currency ?? DEFAULT_CURRENCY,
    subtotalCents: sumCents(purchasableLines.map((l) => l.total)),
    itemCount: purchasableLines.reduce((n, l) => n + l.qty, 0),
    weightGrams,
    warnings,
  };
}

export async function getCart(cartId: string): Promise<Cart> {
  return db.transaction((tx) => loadCart(tx, cartId));
}

// ---------- mutations ----------

// Every mutation runs as: open a transaction, lock the cart row, change it, and return the freshly
// loaded cart from the same transaction. The lock queues concurrent requests on this cart, so two
// simultaneous "add 3" calls against 5 in stock are checked one after the other (the second sees
// the first's rows) instead of both passing a check-then-insert and overselling. The whole cart
// goes back in the response so the UI needs one round trip, never a second GET that could show a
// state the mutation did not produce.
//
// `cartId` here is always the caller's own (see `withCart`): nothing in this file accepts a cart
// id from the request.
async function mutate(cartId: string, change: (tx: Tx) => Promise<void>): Promise<Cart> {
  return db.transaction(async (tx) => {
    const cart = await repo.lockCart(tx, cartId);
    if (!cart) throw notFound('Cart not found');
    await change(tx);
    await repo.setExpiry(tx, cartId, cart.userId ? userExpiry() : guestExpiry());
    return loadCart(tx, cartId);
  });
}

function outOfStock(details: OutOfStockDetails) {
  const message =
    details.maxQty === 0
      ? 'This item is sold out'
      : `Only ${details.maxQty} available, and you already have ${details.inCart} in your cart`;
  return conflict(ErrorCode.OUT_OF_STOCK, message, details);
}

export async function addItem(cartId: string, variantId: string, quantity: number): Promise<Cart> {
  return mutate(cartId, async (tx) => {
    const stock = await repo.findPurchasable(tx, variantId);
    if (!stock) throw notFound('Product variant not found');
    const maxQty = Math.min(MAX_LINE_QUANTITY, stock.available);

    const existing = await repo.findItemByVariant(tx, cartId, variantId);
    const inCart = existing?.quantity ?? 0;
    // Adding is cumulative (the contract says "adds to existing qty"), and the total is what is
    // checked: 3 in the cart plus 3 more must fit in stock together.
    if (inCart + quantity > maxQty) {
      throw outOfStock({ variantId, maxQty, inCart, requested: quantity });
    }
    if (existing) await repo.setItemQuantity(tx, existing.id, inCart + quantity);
    else await repo.insertItem(tx, cartId, variantId, quantity);
  });
}

// Sets an absolute quantity; 0 deletes the line.
export async function updateItem(cartId: string, itemId: string, quantity: number): Promise<Cart> {
  return mutate(cartId, async (tx) => {
    const item = await repo.findItemInCart(tx, cartId, itemId);
    if (!item) throw notFound('Cart item not found');
    if (quantity === 0) {
      await repo.deleteItems(tx, [item.id]);
      return;
    }
    const stock = await repo.findPurchasable(tx, item.variantId);
    if (!stock) throw notFound('Product variant not found');
    const maxQty = Math.min(MAX_LINE_QUANTITY, stock.available);
    if (quantity > maxQty) {
      throw outOfStock({
        variantId: item.variantId,
        maxQty,
        inCart: item.quantity,
        requested: quantity,
      });
    }
    await repo.setItemQuantity(tx, item.id, quantity);
  });
}

export async function removeItem(cartId: string, itemId: string): Promise<Cart> {
  return mutate(cartId, async (tx) => {
    const item = await repo.findItemInCart(tx, cartId, itemId);
    if (!item) throw notFound('Cart item not found');
    await repo.deleteItems(tx, [item.id]);
  });
}

export async function clear(cartId: string): Promise<Cart> {
  return mutate(cartId, (tx) => repo.deleteAllItems(tx, cartId));
}

// ---------- merge on login ----------

export interface MergeResult {
  /** Guest lines that ended up in the user's cart (added or summed). */
  merged: number;
  /** Of those, how many were limited by stock or the 99 cap. */
  clamped: number;
  /** Guest lines left behind because the variant is archived, not on sale or sold out. */
  dropped: number;
}

// Moves a guest cart into the user's active cart when they sign in or register. The rules, which
// are deterministic (same inputs, same result, whatever order requests arrive in):
//   1. Only a live guest cart merges: active, ownerless, not expired. Anything else is a no-op, so
//      a stale or foreign cookie can never pull someone else's cart into an account.
//   2. Quantities for the same variant are SUMMED, then limited to min(99, available stock).
//   3. A merge never lowers what the user already had: the result is at least their old quantity,
//      even if stock has since dropped (the next cart read applies the usual QTY_REDUCED clamp).
//   4. A guest line whose variant is archived, not on sale or sold out is dropped, never added.
//   5. Variants only the guest had are added; variants only the user had are untouched.
//   6. The guest cart is marked `merged` (its rows stay as provenance) so it cannot merge twice.
//   7. All of it is one transaction: a failure leaves both carts exactly as they were.
// Lock order is always guest cart first, then user cart. Mutations lock a single cart, so no
// request ever waits for these two in the opposite order (no deadlock), and two simultaneous
// logins carrying the same guest cookie queue on the guest lock, the second sees `merged` and
// does nothing (no double count).
export async function mergeGuestCart(guestCartId: string, userId: string): Promise<MergeResult> {
  return db.transaction(async (tx) => {
    const result: MergeResult = { merged: 0, clamped: 0, dropped: 0 };

    const guest = await repo.lockCart(tx, guestCartId);
    const live =
      guest && guest.userId === null && guest.status === 'active' && guest.expiresAt > new Date();
    if (!guest || !live) return result;

    const userCart = await getOrCreateUserCart(userId, tx);
    await repo.lockCart(tx, userCart.id);

    for (const line of await repo.listItems(tx, guest.id)) {
      const stock = await repo.findPurchasable(tx, line.variantId);
      const maxQty = stock ? Math.min(MAX_LINE_QUANTITY, stock.available) : 0;
      const existing = await repo.findItemByVariant(tx, userCart.id, line.variantId);
      const had = existing?.quantity ?? 0;

      const wanted = had + line.quantity;
      const quantity = Math.max(had, Math.min(wanted, maxQty));
      if (quantity === 0) {
        result.dropped += 1;
        continue;
      }
      if (existing) await repo.setItemQuantity(tx, existing.id, quantity);
      else await repo.insertItem(tx, userCart.id, line.variantId, quantity);
      result.merged += 1;
      if (quantity < wanted) result.clamped += 1;
    }

    await repo.setExpiry(tx, userCart.id, userExpiry());
    await repo.markStatus(guest.id, 'merged', tx);
    return result;
  });
}
