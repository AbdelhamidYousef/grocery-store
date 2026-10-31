import {
  MAX_LINE_QUANTITY,
  sumCents,
  type Cart,
  type CartItem,
  type CartWarning,
} from '@store/shared';

import type { Tx } from '../../db/client.ts';
import { db } from '../../db/client.ts';

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
