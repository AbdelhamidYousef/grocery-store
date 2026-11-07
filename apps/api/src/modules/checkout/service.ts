import {
  ErrorCode,
  sumCents,
  type CheckoutRequest,
  type Order,
  type OrderStatusResponse,
  type OrderTotals,
  type ShippingQuote,
} from '@store/shared';
import type { Logger } from 'pino';

import { db } from '../../db/client.ts';
import { conflict, notFound, paymentProvider, validation } from '../../lib/errors.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import type { AuthUser } from '../auth/sessions.ts';
import * as cartRepo from '../cart/repo.ts';
import { getCart, loadCart } from '../cart/service.ts';
import { toOrderDto, totalsOf } from '../orders/view.ts';
import * as promotionsRepo from '../promotions/repo.ts';
import * as promotions from '../promotions/service.ts';
import { assertTrialAllowed, customerKey } from '../trials/service.ts';

import { cancelPendingOrder, releaseReservations } from './orders.ts';
import * as repo from './repo.ts';
import { priceBeforeThreshold, quote } from './shipping.ts';

// Prices every active method for the caller's current cart. Weight and subtotal come from the
// re-priced cart (never from the client), and sold-out lines are already excluded from both.
export async function getShippingQuotes(cartId: string, country: string): Promise<ShippingQuote[]> {
  const [cart, methods] = await Promise.all([getCart(cartId), repo.listActiveShippingMethods()]);
  return quote(methods, {
    country,
    weightGrams: cart.weightGrams,
    // The free-delivery threshold counts the merchandise after discounts, like the engine does.
    subtotalCents: cart.pricing.merchandiseCents,
    currency: cart.currency,
  });
}

export interface PlacedOrder {
  orderNumber: string;
  clientSecret: string;
  totals: OrderTotals;
}

const fieldError = (field: string, message: string) =>
  validation({ formErrors: [], fieldErrors: { [field]: [message] } });

// ---------------------------------------------------------------------------------------------
// placeOrder: the one place stock is promised and an amount is decided.
//
// Phase 1, ONE database transaction (nothing external inside it):
//   1. Lock the cart row, then the cart's pending order if it has one (a repeated "pay" click
//      must update that order, not make a second one).
//   2. Lock every inventory row involved (cart lines + the old order's lines) in variant-id order.
//      Locking in one fixed order is what prevents two checkouts from deadlocking each other.
//   3. If there is a pending order, give its reservations back FIRST, so a shopper who holds the
//      last unit can change their mind without being refused by their own reservation.
//   4. Re-price the cart from the catalog. Any warning (sold out, quantity reduced, price moved,
//      variant gone) means the shopper has not seen what they are about to pay: 409 CART_CHANGED.
//   5. Compute the total from DB prices + the shipping rule. The client sends no amount.
//   6. Reserve each line with a conditional UPDATE (reserved + qty <= quantity).
//   7. Create (or rewrite) the order, its snapshot items and its payments row. Commit.
// Phase 2, AFTER the commit: create or update the Stripe PaymentIntent. A network call must not
// run while we hold row locks (a slow Stripe would freeze every checkout of the same product).
// If it fails the order is cancelled and the stock released, so the shelf never stays held for a
// payment that cannot happen. The cart is NOT converted here: only a confirmed payment does that
// (the webhook, 8.5), so a shopper who abandons payment still has their cart.
// ---------------------------------------------------------------------------------------------
export async function placeOrder(
  gateway: PaymentGateway,
  log: Logger,
  cartId: string,
  input: CheckoutRequest,
  user: AuthUser | null,
): Promise<PlacedOrder> {
  const { order, payment } = await reserveAndSave(cartId, input, user);
  const clientSecret = await attachPaymentIntent(gateway, log, order, payment);
  return { orderNumber: order.number, clientSecret, totals: totalsOf(order) };
}

async function reserveAndSave(
  cartId: string,
  input: CheckoutRequest,
  user: AuthUser | null,
): Promise<{ order: repo.OrderRow; payment: repo.PaymentRow }> {
  return db.transaction(async (tx) => {
    const cartRow = await cartRepo.lockCart(tx, cartId);
    if (!cartRow) throw notFound('Cart not found');
    const pending = await repo.findPendingOrderByCart(tx, cartId);
    const pendingItems = pending ? await repo.listOrderItems(tx, pending.id) : [];

    const lines = await cartRepo.listItems(tx, cartId);
    if (lines.length === 0) throw fieldError('cart', 'Your cart is empty');

    // The free gift's stock row joins the same ordered lock set, so gift and lines are locked in
    // one variant-id order (no deadlock with another checkout holding the gift in its cart).
    const giftVariantId = await promotionsRepo.activeGiftVariantId(tx);
    const variantIds = [
      ...lines.map((l) => l.variantId),
      ...pendingItems.flatMap((i) => (i.variantId === null ? [] : [i.variantId])),
      ...(giftVariantId ? [giftVariantId] : []),
    ];
    await repo.lockInventory(tx, [...new Set(variantIds)]);

    let existingPayment: repo.PaymentRow | undefined;
    if (pending) {
      existingPayment = await repo.findPaymentByOrder(tx, pending.id);
      // Once the card is being charged the amount can no longer change under it.
      if (existingPayment?.status === 'processing' || existingPayment?.status === 'succeeded') {
        throw conflict(ErrorCode.CONFLICT, 'A payment for this cart is already in progress');
      }
      await releaseReservations(tx, pendingItems);
    }

    const cart = await loadCart(tx, cartId);
    if (cart.warnings.length > 0 || cart.items.length === 0) {
      // The throw rolls this transaction back, including loadCart's repairs: the next GET /cart
      // repeats and commits them, and that is where the shopper sees the warnings.
      throw conflict(ErrorCode.CART_CHANGED, 'Your cart changed; review it before paying', {
        warnings: cart.warnings,
      });
    }

    // Authoritative trial check (the cart already refuses early, but it is not the last word):
    // quantity at most 1 and no earlier redemption by this customer.
    await assertTrialAllowed(
      tx,
      customerKey(user?.id ?? null, user?.email ?? input.email),
      cart.items,
    );

    const method = await repo.findActiveShippingMethod(input.shippingMethodCode, tx);
    if (!method) throw fieldError('shippingMethodCode', 'Unknown shipping method');

    // The engine decides every amount, now with the chosen method and the customer's email (a
    // guest's per-customer and first-order history is only known from here on). The code row is
    // locked before its uses are counted, so two checkouts racing for a capped code queue up.
    const email = user?.email ?? input.email;
    const key = customerKey(user?.id ?? null, email);
    const result = await promotions.price(tx, {
      currency: cart.currency,
      lines: cart.items
        .filter((i) => i.available > 0)
        .map((i) => ({
          variantId: i.variantId,
          productId: i.productId,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
          isTrial:
            cart.pricing.lines.find((l) => l.variantId === i.variantId)?.priceSource === 'fixed',
        })),
      userId: user?.id ?? null,
      email,
      code: cartRow.discountCode,
      shipping: {
        methodCents: priceBeforeThreshold(method, cart.weightGrams),
        freeOverCents: method.freeOverCents,
      },
      lockCode: true,
      exceptOrderId: pending?.id,
    });
    if (cartRow.discountCode) {
      const refusal = promotions.codeRefusal(
        result.pricing,
        result.code ?? undefined,
        cartRow.discountCode,
        cart.currency,
      );
      if (refusal) throw promotions.codeError(refusal);
    }
    const { priced } = result;
    const subtotalCents = priced.subtotalCents;
    const discountCents = priced.discountCents;
    const shippingCents = priced.shippingCents;
    // Tax is out of scope for this project; the column stays so orders look like real ones.
    const taxCents = 0;
    const totalCents = sumCents([priced.totalCents, taxCents]);

    // Variant-id order again for the writes (locks are already held, but one order everywhere is
    // easier to reason about).
    for (const item of [...cart.items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      if (!(await repo.reserveStock(tx, item.variantId, item.quantity))) {
        // Unreachable while the locks hold; refuses instead of overselling if that ever changes.
        throw conflict(ErrorCode.OUT_OF_STOCK, 'An item just sold out', {
          variantId: item.variantId,
        });
      }
    }

    // The gift last: if its final unit went to one of this cart's own lines, the order simply has
    // no gift (it is free, so no amount changes).
    const gift =
      priced.gift && result.gift && (await repo.reserveStock(tx, priced.gift.variantId, 1))
        ? result.gift
        : null;

    const values = {
      userId: user?.id ?? null,
      // A signed-in user's order carries their account email, not whatever the form held.
      email,
      currency: cart.currency,
      subtotalCents,
      discountCents,
      shippingCents,
      taxCents,
      totalCents,
      shippingMethodCode: method.code,
      shippingMethodName: method.name,
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress ?? null,
      notes: input.notes ?? null,
      cartId,
    };
    const order = pending
      ? await repo.updateOrder(tx, pending.id, values)
      : await repo.insertOrder(tx, { ...values, status: 'pending_payment' });
    if (!pending) {
      await repo.insertHistory(tx, {
        orderId: order.id,
        fromStatus: null,
        toStatus: 'pending_payment',
        actor: 'customer',
      });
    }

    const pricedLine = new Map(priced.lines.map((l) => [l.variantId, l]));
    await repo.replaceOrderItems(tx, order.id, [
      ...cart.items.map((i) => {
        const line = pricedLine.get(i.variantId);
        const unitPriceCents = line?.unitCents ?? i.unitPriceCents;
        return {
          variantId: i.variantId,
          productName: i.productName,
          variantName: i.variantName,
          sku: i.sku,
          imageUrl: i.imageUrl,
          unitPriceCents,
          quantity: i.quantity,
          lineTotalCents: unitPriceCents * i.quantity,
          discountCents: line?.lineDiscountCents ?? 0,
        };
      }),
      ...(gift
        ? [
            {
              variantId: gift.variantId,
              productName: gift.productName,
              variantName: gift.variantName,
              sku: gift.sku,
              imageUrl: gift.imageUrl,
              unitPriceCents: 0,
              quantity: 1,
              lineTotalCents: 0,
            },
          ]
        : []),
    ]);

    // What the engine decided, as values (editing a code later must not rewrite this order), and
    // the code's redemption, reserved with the order and released if it is never paid.
    await promotionsRepo.replaceOrderPromotions(tx, order.id, [
      ...priced.adjustments.map((a) => ({
        type: a.type,
        refId: a.refId,
        label: a.label,
        cents: a.cents,
      })),
      ...(gift
        ? [
            {
              type: 'gift' as const,
              refId: gift.id,
              label: `Free gift: ${gift.productName}`,
              cents: gift.priceCents,
            },
          ]
        : []),
    ]);
    const codeUsed =
      result.code !== null && priced.adjustments.some((a) => a.refId === result.code?.id);
    await promotionsRepo.replaceRedemption(
      tx,
      order.id,
      codeUsed && result.code ? { codeId: result.code.id, customerKey: key } : null,
    );

    // The payments row exists before Stripe is called (its intent id is filled in afterwards), so
    // a crash between the two leaves a pending order we can see and retry, never an orphan intent.
    const payment =
      existingPayment ??
      (await repo.insertPayment(tx, {
        orderId: order.id,
        amountCents: totalCents,
        currency: order.currency,
      }));
    return { order, payment };
  });
}

// Phase 2. Returns the client secret the browser needs to confirm the payment.
async function attachPaymentIntent(
  gateway: PaymentGateway,
  log: Logger,
  order: repo.OrderRow,
  payment: repo.PaymentRow,
): Promise<string> {
  // Without a stored intent there is nothing to retry against, so a failure must not keep the
  // stock held. With one, the shopper can simply try again on the same intent.
  const hadIntent = payment.providerPaymentIntentId !== null;
  try {
    if (!payment.providerPaymentIntentId) {
      // One intent per order for its whole life, hence a key made from the order id alone: a
      // retry after a timeout, a crash or a double click gets the same intent back from Stripe.
      const intent = await gateway.createPaymentIntent({
        amountCents: order.totalCents,
        currency: order.currency,
        orderId: order.id,
        orderNumber: order.number,
        email: order.email,
        idempotencyKey: `order:${order.id}`,
      });
      if (!intent.clientSecret) throw paymentProvider('Stripe returned no client secret');
      await repo.updatePayment(db, payment.id, {
        providerPaymentIntentId: intent.id,
        amountCents: order.totalCents,
      });
      return intent.clientSecret;
    }

    let intent = await gateway.retrievePaymentIntent(payment.providerPaymentIntentId);
    if (intent.status === 'succeeded' || intent.status === 'processing') {
      throw conflict(ErrorCode.CONFLICT, 'A payment for this cart is already in progress');
    }
    if (intent.status === 'canceled') {
      throw conflict(ErrorCode.CONFLICT, 'This payment was cancelled; reload and try again');
    }
    // The cart changed since the intent was made: the shopper must be asked for the new total.
    if (intent.amountCents !== order.totalCents) {
      intent = await gateway.updatePaymentIntentAmount(intent.id, order.totalCents);
    }
    if (!intent.clientSecret) throw paymentProvider('Stripe returned no client secret');
    // Recorded only after Stripe accepted it, so `payments.amount_cents` always names what the
    // intent will really charge (the webhook compares it with the order total).
    await repo.updatePayment(db, payment.id, { amountCents: intent.amountCents });
    return intent.clientSecret;
  } catch (err) {
    if (!hadIntent) {
      try {
        await db.transaction((tx) =>
          cancelPendingOrder(tx, order.id, {
            actor: 'system:checkout',
            note: 'Payment provider unavailable while placing the order',
          }),
        );
      } catch (cleanupError) {
        // The sweeper (8.7) will find this order and release it; the original error is the one
        // the shopper needs to hear about.
        log.error({ err: cleanupError, orderId: order.id }, 'could not release a failed checkout');
      }
    }
    throw err;
  }
}

// ---------- reading an order back ----------

// Who is asking: a signed-in user (by session) and/or a browser that just placed an order (by the
// signed `last_order` cookie). Either one is enough to see that order, nothing more.
export interface OrderViewer {
  userId: string | null;
  lastOrderNumber: string | null;
}

// The access rule for every order read in this module. A missing order and somebody else's order
// answer the same 404, so the endpoint cannot be used to find out which numbers exist.
async function findViewableOrder(
  number: string,
  viewer: OrderViewer,
): Promise<{ order: repo.OrderRow; payment: repo.PaymentRow | undefined }> {
  const order = await repo.findOrderByNumber(number);
  const owns = order && viewer.userId !== null && order.userId === viewer.userId;
  const justPlaced = order && viewer.lastOrderNumber === order.number;
  if (!order || !(owns || justPlaced)) throw notFound('Order not found');
  return { order, payment: await repo.findPaymentByOrder(db, order.id) };
}

export async function getOrderStatus(
  number: string,
  viewer: OrderViewer,
): Promise<OrderStatusResponse['data']> {
  const { order, payment } = await findViewableOrder(number, viewer);
  return { status: order.status, paymentStatus: payment?.status ?? null };
}

export async function getOrder(number: string, viewer: OrderViewer): Promise<Order> {
  const { order, payment } = await findViewableOrder(number, viewer);
  return toOrderDto(order, await repo.listOrderItems(db, order.id), payment);
}
