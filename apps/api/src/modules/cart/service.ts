import {
  ErrorCode,
  MAX_LINE_QUANTITY,
  shortDatedPrice,
  sumCents,
  type BulkAddFailure,
  type Cart,
  type CartItem,
  type CartWarning,
  type CartPricing,
  type OutOfStockDetails,
  type SetSubstitutionInput,
} from '@store/shared';

import { db, type Tx } from '../../db/client.ts';
import { AppError, conflict, notFound, unprocessable } from '../../lib/errors.ts';
import { bundleComponentsOf, listActiveShippingMethods } from '../checkout/repo.ts';
import { estimateRule, priceBeforeThreshold } from '../checkout/shipping.ts';
import { cartDelivery, clearDelivery, putExpress, putSlot } from '../delivery/holds.ts';
import { currentDelivery, currentStore, currentStoreId } from '../i18n/context.ts';
import * as promotions from '../promotions/service.ts';
import { shortDatedAvailability } from '../stock/short-dated.ts';
import * as substitutions from '../substitutions/service.ts';
import { customerKey, isRedeemed, trialLimit } from '../trials/service.ts';

import { getOrCreateUserCart, guestExpiry, userExpiry } from './identity.ts';
import * as repo from './repo.ts';

// Picks the picture for a line: the variant's own image first (the red one, if it is red), then a
// general product image, then whatever the product has. `images` arrives sorted by sort_order.
function pickImage(images: repo.ImageRow[], line: repo.LineRow): repo.ImageRow | undefined {
  return (
    images.find((i) => i.productId === line.productId && i.variantId === line.variantId) ??
    images.find((i) => i.productId === line.productId && i.variantId === null) ??
    images.find((i) => i.productId === line.productId)
  );
}

// ---------- stock planning across lines ----------
//
// Stock belongs to COMPONENTS, and one component can sit in several lines (a kit holding 1 rope
// plus 3 ropes on their own). Checking each line alone would pass a cart that checkout's merged
// reservation then refuses, so every check here works on per-variant demand across the whole cart.
interface StockPlan {
  partsOf(variantId: string): { variantId: string; qty: number }[];
  free: Map<string, number>;
}

async function planStock(tx: Tx, variantIds: string[]): Promise<StockPlan> {
  const kits = await bundleComponentsOf(tx, variantIds);
  const partsOf = (variantId: string) => kits.get(variantId) ?? [{ variantId, qty: 1 }];
  const free = await repo.freeUnits(tx, [
    ...new Set(variantIds.flatMap((v) => partsOf(v).map((p) => p.variantId))),
  ]);
  return { partsOf, free };
}

function addDemand(plan: StockPlan, demand: Map<string, number>, variantId: string, qty: number) {
  for (const p of plan.partsOf(variantId)) {
    demand.set(p.variantId, (demand.get(p.variantId) ?? 0) + p.qty * qty);
  }
}

// How many units of this line still fit once `demand` (the other lines) has taken its share.
function capacity(plan: StockPlan, demand: Map<string, number>, variantId: string): number {
  let fit = Number.POSITIVE_INFINITY;
  for (const p of plan.partsOf(variantId)) {
    const left = (plan.free.get(p.variantId) ?? 0) - (demand.get(p.variantId) ?? 0);
    fit = Math.min(fit, Math.floor(Math.max(0, left) / p.qty));
  }
  return Number.isFinite(fit) ? fit : 0;
}

// Demand of every line in the cart except the one for `exceptVariantId` (the line being changed).
async function demandOfOthers(
  tx: Tx,
  cartId: string,
  exceptVariantId: string,
  variantId: string,
): Promise<{ plan: StockPlan; demand: Map<string, number> }> {
  const others = (await repo.listItems(tx, cartId)).filter((i) => i.variantId !== exceptVariantId);
  const plan = await planStock(tx, [variantId, ...others.map((i) => i.variantId)]);
  const demand = new Map<string, number>();
  for (const i of others) addDemand(plan, demand, i.variantId, i.quantity);
  return { plan, demand };
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
  // The cart is priced in the store view of THIS request, so a shopper who switches store sees the
  // same lines re-priced (a line with no price in the new currency drops out with a warning). The
  // store the cart was last shown in is remembered on the row, nothing more.
  const store = currentStore();
  const currency = store.currency;
  // Flash sales activate lazily on read (before the cart lock, so the sale rows are never locked
  // while holding it).
  await promotions.syncFlashSales(tx);
  const cartRow = await repo.lockCart(tx, cartId);
  // A currency switch re-prices every line, which is not a "the price moved" surprise: the
  // remembered prices are replaced quietly below.
  const switched = cartRow !== undefined && cartRow.currency !== currency;
  if (cartRow && (cartRow.storeView !== store.code || cartRow.currency !== currency)) {
    await repo.setStore(tx, cartId, store.code, currency);
  }
  const lines = await repo.listLines(tx, cartId, currency);
  const images = await repo.listImages(tx, [...new Set(lines.map((l) => l.productId))]);

  const plan = await planStock(
    tx,
    lines.map((l) => l.variantId),
  );
  // Short-dated lines are filled from short-dated packs only: counted per variant for this store,
  // here inside the caller's transaction (checkout has already locked the stock rows). A kit has
  // no packs of its own, so a short-dated flag on one is ignored.
  const shortLines = lines.filter((l) => l.shortDated && !l.isBundle);
  const shortStock = await shortDatedAvailability(
    tx,
    currentStoreId(),
    shortLines.map((l) => l.variantId),
    { exceptCartId: cartId },
  );
  const demand = new Map<string, number>();
  const warnings: CartWarning[] = [];
  const removeIds: string[] = [];
  const items: CartItem[] = [];
  let weightGrams = 0;
  const purchasableLines: { total: number; qty: number }[] = [];
  const pricingLines: promotions.PricingLineInput[] = [];

  for (const line of lines) {
    const base = {
      variantId: line.variantId,
      productName: line.productName,
      variantName: line.variantName,
    };

    // Archived (or draft) products and variants cannot be bought; drop the line and say so.
    // (Or with no price in this store's currency: it was added in another store view.)
    if (
      line.variantStatus !== 'active' ||
      line.productStatus !== 'active' ||
      line.priceCents === null
    ) {
      removeIds.push(line.itemId);
      warnings.push({ code: 'VARIANT_UNAVAILABLE', ...base });
      continue;
    }

    // What is left for this line after the lines above it took their components (a kit and its
    // own part on a separate line draw on the same units).
    const shortDated = line.shortDated && !line.isBundle && !line.soldByWeight;
    const shortOffer = shortDated ? shortStock.get(line.variantId) : undefined;
    const unitCents = shortDated ? shortDatedPrice(line.priceCents) : line.priceCents;
    const available = shortDated
      ? Math.min(capacity(plan, demand, line.variantId), shortOffer?.units ?? 0)
      : capacity(plan, demand, line.variantId);
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

    // Warn once when the catalog price moved since the shopper last saw it, then remember the new
    // price so the next read is calm. A null memory (line predates the column) is filled quietly.
    if (line.lastSeenPriceCents !== line.priceCents) {
      if (line.lastSeenPriceCents !== null && !switched) {
        warnings.push({
          code: 'PRICE_CHANGED',
          ...base,
          previousUnitPriceCents: line.lastSeenPriceCents,
          unitPriceCents: line.priceCents,
        });
      }
      await repo.setLastSeenPrice(tx, line.itemId, line.priceCents);
    }

    // Only what the shopper can actually buy takes stock from the lines below.
    if (available > 0) addDemand(plan, demand, line.variantId, quantity);

    const image = pickImage(images, line);
    const lineTotal = unitCents * quantity;
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
      unitPriceCents: unitCents,
      quantity,
      lineTotalCents: lineTotal,
      available,
      maxQty,
      shortDated,
      bestBefore: shortOffer?.bestBefore ?? null,
      // A "specific" choice whose product is gone reads as a best match (the FK set it to null).
      substitution:
        line.substitution === 'specific' && !line.substitute ? 'best_match' : line.substitution,
      substitute: line.substitution === 'specific' ? line.substitute : null,
      weight:
        line.soldByWeight && line.pricePerKgCents !== null && line.nominalGrams !== null
          ? { pricePerKgCents: line.pricePerKgCents, nominalGrams: line.nominalGrams }
          : null,
    });

    // Sold-out lines are shown but never counted: the subtotal is what can actually be bought.
    if (available > 0) {
      purchasableLines.push({ total: lineTotal, qty: quantity });
      pricingLines.push({
        variantId: line.variantId,
        productId: line.productId,
        quantity,
        unitPriceCents: unitCents,
        // Trial sizes, kits and short-dated packs all price at their own fixed price: no sale or
        // member price, no code or order discount on top of an offer that is already 30 % off.
        isTrial: line.isTrial || line.isBundle || shortDated,
      });
      weightGrams += line.weightGrams * quantity;
    }
  }

  await repo.deleteItems(tx, removeIds);

  const rule = estimateRule(await listActiveShippingMethods(tx, currency));
  const { pricing } = await promotions.price(tx, {
    currency,
    lines: pricingLines,
    userId: cartRow?.userId ?? null,
    email: null,
    code: cartRow?.discountCode ?? null,
    shipping: {
      methodCents: rule ? priceBeforeThreshold(rule, weightGrams) : 0,
      freeOverCents: rule?.freeOverCents ?? null,
    },
  });

  return {
    items,
    currency,
    subtotalCents: sumCents(purchasableLines.map((l) => l.total)),
    itemCount: purchasableLines.reduce((n, l) => n + l.qty, 0),
    weightGrams,
    warnings,
    pricing,
    delivery: cartRow ? await deliveryOf(tx, cartRow) : null,
  };
}

// What `GET /cart` answers for a visitor who has no cart yet (nothing is stored for them).
export function emptyCart(): Cart {
  return {
    items: [],
    currency: currentStore().currency,
    subtotalCents: 0,
    itemCount: 0,
    weightGrams: 0,
    warnings: [],
    pricing: EMPTY_PRICING,
    delivery: null,
  };
}

const EMPTY_PRICING: CartPricing = {
  code: null,
  lines: [],
  adjustments: [],
  discountCents: 0,
  merchandiseCents: 0,
  shippingEstimateCents: 0,
  totalEstimateCents: 0,
  gift: null,
  progress: { freeShipping: null, gift: null, nextTier: null },
  notices: [],
};

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
async function mutate(
  cartId: string,
  change: (tx: Tx, cart: repo.CartRow) => Promise<void>,
): Promise<Cart> {
  return db.transaction(async (tx) => {
    const cart = await repo.lockCart(tx, cartId);
    if (!cart) throw notFound('Cart not found');
    await change(tx, cart);
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

// The cart-level half of the trial rule: at most 1 of a trial variant in the cart, and none if the
// signed-in customer already had it. (A guest's history is unknown until checkout asks for their
// email, so checkout repeats the check; see checkout/service.ts.)
async function assertTrialAddable(tx: Tx, cart: repo.CartRow, variantId: string, total: number) {
  if (total > 1) throw trialLimit(variantId, 'A trial size is limited to one per customer');
  if (cart.userId && (await isRedeemed(tx, customerKey(cart.userId, ''), variantId))) {
    throw trialLimit(variantId, 'You have already had this trial size');
  }
}

// One line of an add, inside the caller's transaction. Throws the same errors for a single add and
// for each line of a bulk add.
async function addLine(
  tx: Tx,
  cart: repo.CartRow,
  cartId: string,
  variantId: string,
  quantity: number,
  shortDated = false,
): Promise<void> {
  const stock = await repo.findPurchasable(tx, variantId);
  if (!stock) throw notFound('Product variant not found');
  if (shortDated && (await bundleComponentsOf(tx, [variantId])).has(variantId)) {
    throw conflict(ErrorCode.CONFLICT, 'A kit has no short-dated offer');
  }
  if (shortDated && stock.soldByWeight) {
    throw conflict(ErrorCode.CONFLICT, 'Items sold by weight have no short-dated offer');
  }
  // Stock left for this variant once the OTHER lines (kits expanded) have their share.
  const others = await demandOfOthers(tx, cartId, variantId, variantId);
  let maxQty = Math.min(MAX_LINE_QUANTITY, capacity(others.plan, others.demand, variantId));
  if (shortDated) {
    // The short-dated packs are a smaller pool inside that stock.
    const offer = (
      await shortDatedAvailability(tx, currentStoreId(), [variantId], { exceptCartId: cartId })
    ).get(variantId);
    maxQty = Math.min(maxQty, offer?.units ?? 0);
  }

  const existing = await repo.findItemByVariant(tx, cartId, variantId);
  // A variant is one line: choosing the other offer switches the line and starts its count again.
  const switching = existing !== undefined && existing.shortDated !== shortDated;
  const inCart = existing && !switching ? existing.quantity : 0;
  if (stock.isTrial) await assertTrialAddable(tx, cart, variantId, inCart + quantity);
  // Adding is cumulative (the contract says "adds to existing qty"), and the total is what is
  // checked: 3 in the cart plus 3 more must fit in stock together.
  if (inCart + quantity > maxQty) {
    throw outOfStock({ variantId, maxQty, inCart, requested: quantity });
  }
  if (existing && switching) {
    await repo.setItemMode(tx, existing.id, shortDated, quantity, stock.priceCents);
  } else if (existing) {
    await repo.setItemQuantity(tx, existing.id, inCart + quantity, stock.priceCents);
  } else {
    // A new line starts with the account's preference (a guest has the shop's default).
    const substitution = cart.userId
      ? await repo.defaultSubstitutionOf(tx, cart.userId)
      : 'best_match';
    await repo.insertItem(tx, cartId, variantId, quantity, stock.priceCents, shortDated, {
      substitution,
      substituteVariantId: null,
    });
  }
}

export async function addItem(
  cartId: string,
  variantId: string,
  quantity: number,
  shortDated = false,
): Promise<Cart> {
  return mutate(cartId, (tx, cart) => addLine(tx, cart, cartId, variantId, quantity, shortDated));
}

// All or nothing: every line is tried inside ONE transaction and the problems of every line are
// collected, so the shopper hears about all of them at once, and if any line fails the throw rolls
// the whole transaction back (no half-filled cart). Each failure keeps its own code, so the web can
// say "sold out" for one line and "one per customer" for another.
export async function addItems(
  cartId: string,
  lines: { variantId: string; quantity: number }[],
): Promise<Cart> {
  return mutate(cartId, async (tx, cart) => {
    const failures: BulkAddFailure[] = [];
    for (const line of lines) {
      try {
        await addLine(tx, cart, cartId, line.variantId, line.quantity);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        const details = err.details as { maxQty?: number } | undefined;
        failures.push({
          variantId: line.variantId,
          code:
            err.code === ErrorCode.OUT_OF_STOCK || err.code === ErrorCode.TRIAL_LIMIT
              ? err.code
              : 'NOT_FOUND',
          message: err.message,
          ...(typeof details?.maxQty === 'number' && { maxQty: details.maxQty }),
        });
      }
    }
    if (failures.length > 0) {
      throw conflict(ErrorCode.CONFLICT, 'Some items could not be added', { failures });
    }
  });
}

// Sets an absolute quantity; 0 deletes the line.
export async function updateItem(cartId: string, itemId: string, quantity: number): Promise<Cart> {
  return mutate(cartId, async (tx, cart) => {
    const item = await repo.findItemInCart(tx, cartId, itemId);
    if (!item) throw notFound('Cart item not found');
    if (quantity === 0) {
      await repo.deleteItems(tx, [item.id]);
      return;
    }
    const stock = await repo.findPurchasable(tx, item.variantId);
    if (!stock) throw notFound('Product variant not found');
    if (stock.isTrial) await assertTrialAddable(tx, cart, item.variantId, quantity);
    const others = await demandOfOthers(tx, cartId, item.variantId, item.variantId);
    let maxQty = Math.min(MAX_LINE_QUANTITY, capacity(others.plan, others.demand, item.variantId));
    if (item.shortDated) {
      const offer = (
        await shortDatedAvailability(tx, currentStoreId(), [item.variantId], {
          exceptCartId: cartId,
        })
      ).get(item.variantId);
      maxQty = Math.min(maxQty, offer?.units ?? 0);
    }
    if (quantity > maxQty) {
      throw outOfStock({
        variantId: item.variantId,
        maxQty,
        inCart: item.quantity,
        requested: quantity,
      });
    }
    await repo.setItemQuantity(tx, item.id, quantity, stock.priceCents);
  });
}

// "If it's missing": best match, refund it, or a product the shopper picked from the line's own
// best-match list (so it is always safe, in stock and about the same price).
export async function setSubstitution(
  cartId: string,
  itemId: string,
  input: SetSubstitutionInput,
): Promise<Cart> {
  return mutate(cartId, async (tx) => {
    const item = await repo.findItemInCart(tx, cartId, itemId);
    if (!item) throw notFound('Cart item not found');
    if (input.substitution !== 'specific' || !input.substituteVariantId) {
      await repo.setItemSubstitution(tx, item.id, input.substitution, null);
      return;
    }
    const options = await substitutions.matchesFor(
      tx,
      item.variantId,
      currentStoreId(),
      currentStore().currency,
    );
    if (!options?.matches.some((m) => m.variantId === input.substituteVariantId)) {
      throw unprocessable('That product is not a safe replacement for this item');
    }
    await repo.setItemSubstitution(tx, item.id, 'specific', input.substituteVariantId);
  });
}

export async function setSubstitutionForAll(
  cartId: string,
  substitution: 'best_match' | 'none',
): Promise<Cart> {
  return mutate(cartId, (tx) => repo.setAllSubstitutions(tx, cartId, substitution));
}

export async function removeItem(cartId: string, itemId: string): Promise<Cart> {
  return mutate(cartId, async (tx) => {
    const item = await repo.findItemInCart(tx, cartId, itemId);
    if (!item) throw notFound('Cart item not found');
    await repo.deleteItems(tx, [item.id]);
  });
}

// Applies a code only if it would really do something now; otherwise refuses with a kind reason
// and leaves the cart as it was. A code that later stops applying (cart shrank, code expired)
// stays on the cart and the pricing notices explain why it is not counted.
export async function applyCode(cartId: string, code: string): Promise<Cart> {
  return mutate(cartId, async (tx) => {
    await repo.setDiscountCode(tx, cartId, code);
    const trial = await loadCart(tx, cartId);
    const refusal = promotions.codeRefusal(
      trial.pricing,
      await promotions.findCode(tx, code),
      code,
      trial.currency,
    );
    if (refusal) throw promotions.codeError(refusal);
  });
}

export async function removeCode(cartId: string): Promise<Cart> {
  return mutate(cartId, (tx) => repo.setDiscountCode(tx, cartId, null));
}

export async function clear(cartId: string): Promise<Cart> {
  return mutate(cartId, async (tx, cart) => {
    await repo.deleteAllItems(tx, cartId);
    // An empty cart holds no place: free the slot at once instead of waiting for it to expire.
    await clearDelivery(tx, cart);
  });
}

// ---------- delivery: slot hold or express (rules in delivery/holds.ts) ----------

// The delivery the cart response shows, read with the cart row locked by the surrounding call.
function deliveryOf(tx: Tx, cartRow: repo.CartRow) {
  return cartDelivery(tx, cartRow, new Date());
}

// The slot must belong to the store of the shopper's postcode (the `X-Postcode` header).
export async function setSlot(cartId: string, slotId: string): Promise<Cart> {
  return mutate(cartId, (tx, cart) =>
    putSlot(tx, cart, slotId, currentDelivery().storeId, new Date()),
  );
}

export async function setExpress(cartId: string): Promise<Cart> {
  return mutate(cartId, (tx, cart) => putExpress(tx, cart, currentDelivery(), new Date()));
}

export async function clearSlot(cartId: string): Promise<Cart> {
  return mutate(cartId, (tx, cart) => clearDelivery(tx, cart));
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
      // A trial size merges as at most one unit, and not at all if the account already had it.
      const trialCap = stock?.isTrial
        ? (await isRedeemed(tx, customerKey(userId, ''), line.variantId))
          ? 0
          : 1
        : MAX_LINE_QUANTITY;
      const maxQty = stock ? Math.min(trialCap, stock.available) : 0;
      const existing = await repo.findItemByVariant(tx, userCart.id, line.variantId);
      const had = existing?.quantity ?? 0;

      const wanted = had + line.quantity;
      const quantity = Math.max(had, Math.min(wanted, maxQty));
      if (quantity === 0) {
        result.dropped += 1;
        continue;
      }
      // A merge is not the shopper looking at a price: the user's own line keeps what it
      // remembered, and a guest-only line brings its memory along, so a pending change still warns.
      if (existing) await repo.setItemQuantity(tx, existing.id, quantity);
      else {
        await repo.insertItem(
          tx,
          userCart.id,
          line.variantId,
          quantity,
          line.lastSeenPriceCents,
          line.shortDated,
          { substitution: line.substitution, substituteVariantId: line.substituteVariantId },
        );
      }
      result.merged += 1;
      if (quantity < wanted) result.clamped += 1;
    }

    await repo.setExpiry(tx, userCart.id, userExpiry());
    await repo.markStatus(guest.id, 'merged', tx);
    return result;
  });
}
