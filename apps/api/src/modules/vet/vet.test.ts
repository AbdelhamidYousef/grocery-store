import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { emailOutbox, orderStatusHistory, orderVetDetails } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import {
  TEST_ADDRESS,
  TEST_VET,
  heldOrder,
  orderByNumber,
  placeOrder,
  signedIn,
  simulate,
  stockOf,
} from '../../test/orders.ts';

const app = makeTestApp();

beforeEach(async () => {
  await createShippingMethods();
});

async function flaggedCart(buyer: Awaited<ReturnType<typeof signedIn>>) {
  const { variants } = await createProduct({
    requiresVetApproval: true,
    variants: [{ priceCents: 1500, stock: 10 }],
  });
  await buyer.shopper.addToCart(variants[0]!.id, 1);
  return variants[0]!.id;
}

const checkout = (buyer: Awaited<ReturnType<typeof signedIn>>, extra: object = {}) =>
  buyer.shopper.call('post', '/checkout', {
    email: buyer.user.email,
    shippingAddress: TEST_ADDRESS,
    shippingMethodCode: 'standard',
    ...extra,
  });

describe('checkout with a vet-approval item', () => {
  it('tells the cart that a vet is needed', async () => {
    const buyer = await signedIn(app);
    await flaggedCart(buyer);
    const cart = bodyOf<{ data: { requiresVetApproval: boolean } }>(
      await buyer.shopper.call('get', '/cart'),
    );
    expect(cart.data.requiresVetApproval).toBe(true);
  });

  it('refuses checkout without vet details (422) and places nothing', async () => {
    const buyer = await signedIn(app);
    const variantId = await flaggedCart(buyer);
    const res = await checkout(buyer);
    expect(res.status).toBe(422);
    expect(JSON.stringify(errorOf(res).details)).toContain('vetDetails');
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
  });

  it('validates the vet details like any form (400 for an invalid email)', async () => {
    const buyer = await signedIn(app);
    await flaggedCart(buyer);
    const res = await checkout(buyer, { vetDetails: { ...TEST_VET, vetEmail: 'not-an-email' } });
    expect(res.status).toBe(400);
    const empty = await checkout(buyer, { vetDetails: { ...TEST_VET, clinic: '' } });
    expect(empty.status).toBe(400);
  });

  it('stores the vet details with the order, and replaces them when the form is sent again', async () => {
    const buyer = await signedIn(app);
    await flaggedCart(buyer);
    const first = bodyOf<{ data: { orderNumber: string } }>(
      await checkout(buyer, { vetDetails: TEST_VET }),
    ).data.orderNumber;
    const order = await orderByNumber(first);
    expect((await db.select().from(orderVetDetails))[0]).toMatchObject({
      orderId: order.id,
      ...TEST_VET,
      decision: 'pending',
    });
    const again = await checkout(buyer, { vetDetails: { ...TEST_VET, vetName: 'Dr Sam Pike' } });
    expect(bodyOf<{ data: { orderNumber: string } }>(again).data.orderNumber).toBe(first);
    const rows = await db.select().from(orderVetDetails);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.vetName).toBe('Dr Sam Pike');
  });

  it('does not touch a cart without a flagged item, and ignores vet details sent anyway', async () => {
    const plain = await placeOrder(app, {});
    expect((await db.select().from(orderVetDetails)).length).toBe(0);
    const buyer = await signedIn(app);
    const { variants } = await createProduct({ variants: [{ priceCents: 500, stock: 5 }] });
    await buyer.shopper.addToCart(variants[0]!.id, 1);
    expect((await checkout(buyer, { vetDetails: TEST_VET })).status).toBe(200);
    expect((await db.select().from(orderVetDetails)).length).toBe(0);
    await simulate(app, plain.number);
    expect((await orderByNumber(plain.number)).status).toBe('paid');
  });

  it('lets the product page know the item needs approval', async () => {
    const { product } = await createProduct({ slug: 'calmwell', requiresVetApproval: true });
    void product;
    const res = await signedIn(app).then((b) => b.shopper.call('get', '/products/calmwell'));
    expect(bodyOf<{ data: { requiresVetApproval: boolean } }>(res).data.requiresVetApproval).toBe(
      true,
    );
  });
});

describe('payment of a vet-approval order', () => {
  it('holds the order in awaiting_vet_approval with the stock committed', async () => {
    const held = await heldOrder(app, { quantity: 2, stock: 10 });
    expect((await orderByNumber(held.number)).status).toBe('awaiting_vet_approval');
    // Taken off the shelf at payment, like any paid order; nothing is released while waiting.
    expect(await stockOf(held.variantId)).toEqual({ quantity: 8, reserved: 0 });
    const history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, (await orderByNumber(held.number)).id));
    expect(history.map((h) => h.toStatus)).toEqual([
      'pending_payment',
      'paid',
      'awaiting_vet_approval',
    ]);
    // The customer still gets the order confirmation.
    const mails = await db.select().from(emailOutbox);
    expect(mails.map((m) => m.kind)).toContain('order_confirmation');
  });

  it('cannot be moved on by the generic status endpoint', async () => {
    const held = await heldOrder(app);
    const admin = await signedIn(app, 'admin', 'boss@pawsome.test');
    for (const to of ['processing', 'cancelled']) {
      const res = await admin.shopper.call('post', `/admin/orders/${held.number}/transition`, {
        to,
      });
      expect(res.status).toBe(409);
      expect(errorOf(res).message).toMatch(/vet/);
    }
    const plain = await placeOrder(app, {});
    await simulate(app, plain.number);
    const res = await admin.shopper.call('post', `/admin/orders/${plain.number}/transition`, {
      to: 'awaiting_vet_approval',
    });
    expect(res.status).toBe(409);
    const detail = bodyOf<{ data: { allowedNext: string[] } }>(
      await admin.shopper.call('get', `/admin/orders/${held.number}`),
    );
    expect(detail.data.allowedNext).toEqual([]);
  });
});
