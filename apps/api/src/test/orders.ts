import { BASKET_RULES } from '@store/shared';
import { and, eq } from 'drizzle-orm';
import type { Express } from 'express';
import { pino } from 'pino';
import request from 'supertest';

import { db } from '../db/client.ts';
import { inventory, orderStatusHistory, orders } from '../db/schema/index.ts';
import { DEFAULT_STORE_ID } from '../db/seed/delivery.ts';
import type { PaymentGateway } from '../lib/stripe.ts';
import { createSession } from '../modules/auth/sessions.ts';
import { finalizeOrder } from '../modules/checkout/capture.ts';

import { TEST_HOOK_SECRET } from './app.ts';
import { createProduct, createUser } from './factories.ts';
import { bodyOf } from './http.ts';
import { makeShopper, type Shopper } from './shopper.ts';

export const TEST_ADDRESS = {
  fullName: 'Ada Lovelace',
  line1: '1 Bone Street',
  city: 'Riga',
  postalCode: '10115',
  country: 'DE',
};

// Places a real order through POST /checkout (so reservations, snapshots and the payment row are
// exactly what production creates). Needs `createShippingMethods()` to have run.
export async function placeOrder(
  app: Express,
  opts: {
    variantId?: string;
    quantity?: number;
    stock?: number;
    priceCents?: number;
    shopper?: Shopper;
    email?: string;
  } = {},
) {
  let variantId = opts.variantId;
  if (!variantId) {
    // A default basket must reach the minimum order (G9) on its own, so a one-unit order is priced
    // at the minimum and keeps its single line.
    const quantity = opts.quantity ?? 2;
    const { variants } = await createProduct({
      variants: [
        {
          priceCents:
            opts.priceCents ?? Math.max(1000, Math.ceil(BASKET_RULES.minOrderCents / quantity)),
          stock: opts.stock ?? 10,
        },
      ],
    });
    variantId = variants[0]!.id;
  }
  const shopper = opts.shopper ?? makeShopper(app);
  const added = await shopper.addToCart(variantId, opts.quantity ?? 2);
  if (added.status >= 400) throw new Error(`add to cart failed: ${added.status}`);
  const res = await shopper.call('post', '/checkout', {
    email: opts.email ?? 'ada@grocery.test',
    shippingAddress: TEST_ADDRESS,
    shippingMethodCode: 'standard',
  });
  if (res.status !== 200)
    throw new Error(`checkout failed: ${res.status} ${JSON.stringify(res.body)}`);
  const number = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
  return { number, variantId, shopper };
}

// Drives a webhook event through the real handler (NODE_ENV=test only endpoint).
export function simulate(
  app: Express,
  orderNumber: string,
  type:
    | 'payment_intent.succeeded'
    | 'payment_intent.amount_capturable_updated'
    | 'payment_intent.canceled'
    | 'charge.refunded' = 'payment_intent.succeeded',
) {
  return request(app)
    .post('/api/v1/test/webhooks/simulate')
    .set('X-Test-Hook-Secret', TEST_HOOK_SECRET)
    .send({ orderNumber, type });
}

// One store's shelf of a variant (the default store, Mitte, unless another is named).
export async function stockOf(variantId: string, storeId: string = DEFAULT_STORE_ID) {
  const [row] = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.variantId, variantId), eq(inventory.storeId, storeId)));
  return { quantity: row!.quantity, reserved: row!.reserved };
}

export async function orderByNumber(number: string) {
  const [row] = await db.select().from(orders).where(eq(orders.number, number));
  return row!;
}

// Takes the money of an authorised order (what picking, the admin or the overdue job do): a paid
// order of this app is only AUTHORISED until then, so tests of refunds and returns capture first.
export async function captureOrder(app: Express, number: string) {
  const order = await orderByNumber(number);
  const gateway = app.locals.testGateway as PaymentGateway;
  return finalizeOrder({ gateway, log: pino({ level: 'silent' }) }, order.id, {
    actor: 'test:capture',
  });
}

// A signed-in browser for an existing or new user.
export async function signedIn(
  app: Express,
  role: 'customer' | 'admin' = 'customer',
  email?: string,
) {
  const user = await createUser({ role, ...(email && { email }) });
  const { token } = await createSession(user.id);
  return { user, shopper: makeShopper(app, token) };
}

// Puts a paid order into `delivered` as if it had shipped `daysAgo` days ago: sets the status and
// writes the history row the return window is measured from. Skips the shipping steps on purpose
// (their stock effects are none: the units left the shelf at payment).
export async function markDelivered(number: string, daysAgo = 1) {
  const order = await orderByNumber(number);
  await db.update(orders).set({ status: 'delivered' }).where(eq(orders.id, order.id));
  await db.insert(orderStatusHistory).values({
    orderId: order.id,
    fromStatus: 'shipped',
    toStatus: 'delivered',
    actor: 'test',
    createdAt: new Date(Date.now() - daysAgo * 86_400_000),
  });
}

// A signed-in customer who has bought and received something: the starting point of return tests.
export async function deliveredOrder(
  app: Express,
  opts: { quantity?: number; priceCents?: number; daysAgo?: number; stock?: number } = {},
) {
  const buyer = await signedIn(
    app,
    'customer',
    `buyer${Math.random().toString(36).slice(2, 8)}@grocery.test`,
  );
  const placed = await placeOrder(app, {
    shopper: buyer.shopper,
    email: buyer.user.email,
    ...(opts.quantity !== undefined && { quantity: opts.quantity }),
    ...(opts.priceCents !== undefined && { priceCents: opts.priceCents }),
    ...(opts.stock !== undefined && { stock: opts.stock }),
  });
  await simulate(app, placed.number);
  // A delivered order has been captured (packing takes the money); returns refund what was taken.
  await captureOrder(app, placed.number);
  await markDelivered(placed.number, opts.daysAgo ?? 1);
  return { ...placed, buyer };
}
