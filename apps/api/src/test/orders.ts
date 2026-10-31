import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';

import { db } from '../db/client.ts';
import { inventory, orders } from '../db/schema/index.ts';
import { createSession } from '../modules/auth/sessions.ts';

import { TEST_HOOK_SECRET } from './app.ts';
import { createProduct, createUser } from './factories.ts';
import { bodyOf } from './http.ts';
import { makeShopper, type Shopper } from './shopper.ts';

export const TEST_ADDRESS = {
  fullName: 'Ada Lovelace',
  line1: '1 Bone Street',
  city: 'Riga',
  postalCode: 'LV-1010',
  country: 'LV',
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
    const { variants } = await createProduct({
      variants: [{ priceCents: opts.priceCents ?? 1000, stock: opts.stock ?? 10 }],
    });
    variantId = variants[0]!.id;
  }
  const shopper = opts.shopper ?? makeShopper(app);
  const added = await shopper.addToCart(variantId, opts.quantity ?? 2);
  if (added.status >= 400) throw new Error(`add to cart failed: ${added.status}`);
  const res = await shopper.call('post', '/checkout', {
    email: opts.email ?? 'ada@pawsome.test',
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
    | 'payment_intent.canceled'
    | 'charge.refunded' = 'payment_intent.succeeded',
) {
  return request(app)
    .post('/api/v1/test/webhooks/simulate')
    .set('X-Test-Hook-Secret', TEST_HOOK_SECRET)
    .send({ orderNumber, type });
}

export async function stockOf(variantId: string) {
  const [row] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
  return { quantity: row!.quantity, reserved: row!.reserved };
}

export async function orderByNumber(number: string) {
  const [row] = await db.select().from(orders).where(eq(orders.number, number));
  return row!;
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
