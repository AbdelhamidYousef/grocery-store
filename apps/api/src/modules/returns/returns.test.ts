import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { orderItems, orderStatusHistory } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import {
  TEST_ADDRESS,
  deliveredOrder,
  markDelivered,
  orderByNumber,
  placeOrder,
  signedIn,
  simulate,
} from '../../test/orders.ts';

const app = makeTestApp();

beforeEach(async () => {
  await createShippingMethods();
});

interface ReturnBody {
  data: {
    id: string;
    status: string;
    refundCents: number;
    items: { orderItemId: string; quantity: number; refundCents: number; reason: string }[];
  };
}
interface ListBody {
  data: {
    returns: { id: string; status: string }[];
    eligibility: {
      eligible: boolean;
      reason: string | null;
      deadline: string | null;
      lines: { orderItemId: string; returnableQuantity: number }[];
    };
  };
}

async function lineOf(number: string) {
  const order = await orderByNumber(number);
  const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return line!;
}

describe('POST /orders/:number/returns', () => {
  it('creates a request for a delivered order and computes the refund in integer cents', async () => {
    const o = await deliveredOrder(app, { quantity: 3, priceCents: 1999 });
    const line = await lineOf(o.number);
    const res = await o.buyer.shopper.call('post', `/orders/${o.number}/returns`, {
      reason: 'wrong_size',
      note: 'Too small',
      items: [{ orderItemId: line.id, quantity: 2 }],
    });
    expect(res.status).toBe(201);
    const body = bodyOf<ReturnBody>(res);
    expect(body.data.status).toBe('requested');
    expect(body.data.refundCents).toBe(2 * 1999);
    expect(body.data.items[0]).toMatchObject({ quantity: 2, reason: 'wrong_size' });
  });

  it('refunds the price PAID: the order-level discount stored on the line is taken off', async () => {
    const o = await deliveredOrder(app, { quantity: 2, priceCents: 1000 });
    const line = await lineOf(o.number);
    await db.update(orderItems).set({ discountCents: 501 }).where(eq(orderItems.id, line.id));
    const first = bodyOf<ReturnBody>(
      await o.buyer.shopper.call('post', `/orders/${o.number}/returns`, {
        reason: 'changed_mind',
        items: [{ orderItemId: line.id, quantity: 1 }],
      }),
    );
    const second = bodyOf<ReturnBody>(
      await o.buyer.shopper.call('post', `/orders/${o.number}/returns`, {
        reason: 'changed_mind',
        items: [{ orderItemId: line.id, quantity: 1 }],
      }),
    );
    // paid 1499 for 2 units: 749 then 750, the remainder cent goes to the last unit.
    expect([first.data.refundCents, second.data.refundCents]).toEqual([749, 750]);
  });

  it('refuses an order that is not delivered (409)', async () => {
    const buyer = await signedIn(app);
    const placed = await placeOrder(app, { shopper: buyer.shopper, email: buyer.user.email });
    await simulate(app, placed.number);
    const line = await lineOf(placed.number);
    const res = await buyer.shopper.call('post', `/orders/${placed.number}/returns`, {
      reason: 'damaged',
      items: [{ orderItemId: line.id, quantity: 1 }],
    });
    expect(res.status).toBe(409);
    expect(errorOf(res).message).toMatch(/delivered/);
  });

  it('refuses a return outside the window (409) and offers it inside', async () => {
    const late = await deliveredOrder(app, { daysAgo: 31 });
    const lateLine = await lineOf(late.number);
    const res = await late.buyer.shopper.call('post', `/orders/${late.number}/returns`, {
      reason: 'damaged',
      items: [{ orderItemId: lateLine.id, quantity: 1 }],
    });
    expect(res.status).toBe(409);
    expect(errorOf(res).message).toMatch(/30-day/);

    const ok = await deliveredOrder(app, { daysAgo: 29 });
    const okLine = await lineOf(ok.number);
    const accepted = await ok.buyer.shopper.call('post', `/orders/${ok.number}/returns`, {
      reason: 'damaged',
      items: [{ orderItemId: okLine.id, quantity: 1 }],
    });
    expect(accepted.status).toBe(201);
  });

  it('uses the configured window', async () => {
    const short = makeTestApp({ config: { returns: { windowDays: 5, simulated: false } } });
    const o = await deliveredOrder(short, { daysAgo: 6 });
    const line = await lineOf(o.number);
    const res = await o.buyer.shopper.call('post', `/orders/${o.number}/returns`, {
      reason: 'damaged',
      items: [{ orderItemId: line.id, quantity: 1 }],
    });
    expect(res.status).toBe(409);
    expect(errorOf(res).message).toMatch(/5-day/);
  });

  it('refuses more units than were bought, and counts units already in a return (422)', async () => {
    const o = await deliveredOrder(app, { quantity: 2 });
    const line = await lineOf(o.number);
    const call = (quantity: number) =>
      o.buyer.shopper.call('post', `/orders/${o.number}/returns`, {
        reason: 'damaged',
        items: [{ orderItemId: line.id, quantity }],
      });
    expect((await call(3)).status).toBe(422);
    expect((await call(1)).status).toBe(201);
    const over = await call(2);
    expect(over.status).toBe(422);
    expect(errorOf(over).message).toMatch(/at most 1/);
    expect((await call(1)).status).toBe(201);
    expect((await call(1)).status).toBe(409); // nothing left at all: the order has no returnable line
  });

  it('refuses a duplicate line, a foreign line and a free line (422)', async () => {
    const o = await deliveredOrder(app, { quantity: 2 });
    const other = await deliveredOrder(app);
    const line = await lineOf(o.number);
    const post = (items: object[]) =>
      o.buyer.shopper.call('post', `/orders/${o.number}/returns`, { reason: 'other', items });
    expect(
      (
        await post([
          { orderItemId: line.id, quantity: 1 },
          { orderItemId: line.id, quantity: 1 },
        ])
      ).status,
    ).toBe(422);
    expect(
      (await post([{ orderItemId: (await lineOf(other.number)).id, quantity: 1 }])).status,
    ).toBe(422);
    expect(errorOf(await post([{ orderItemId: line.id, quantity: 3 }])).message).toMatch(
      /at most 2/,
    );
  });

  it('refuses a free line (a gift) while the rest of the order stays returnable (422)', async () => {
    const buyer = await signedIn(app);
    const a = await createProduct({ variants: [{ priceCents: 1000, stock: 5 }] });
    const b = await createProduct({ variants: [{ priceCents: 700, stock: 5 }] });
    await buyer.shopper.addToCart(a.variants[0]!.id, 1);
    await buyer.shopper.addToCart(b.variants[0]!.id, 1);
    const placed = bodyOf<{ data: { orderNumber: string } }>(
      await buyer.shopper.call('post', '/checkout', {
        email: buyer.user.email,
        shippingAddress: TEST_ADDRESS,
        shippingMethodCode: 'standard',
      }),
    ).data.orderNumber;
    await simulate(app, placed);
    await markDelivered(placed);
    const order = await orderByNumber(placed);
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const gift = lines.find((l) => l.unitPriceCents === 700)!;
    await db
      .update(orderItems)
      .set({ discountCents: gift.lineTotalCents })
      .where(eq(orderItems.id, gift.id));
    const res = await buyer.shopper.call('post', `/orders/${placed}/returns`, {
      reason: 'other',
      items: [{ orderItemId: gift.id, quantity: 1 }],
    });
    expect(res.status).toBe(422);
    expect(errorOf(res).message).toMatch(/free/);
    const list = bodyOf<ListBody>(await buyer.shopper.call('get', `/orders/${placed}/returns`));
    expect(list.data.eligibility.eligible).toBe(true);
    expect(list.data.eligibility.lines.map((l) => l.returnableQuantity).sort()).toEqual([0, 1]);
  });

  it("answers 404 for another customer's order, a guest 401, and a bad body 400", async () => {
    const o = await deliveredOrder(app);
    const line = await lineOf(o.number);
    const stranger = await signedIn(app);
    const body = { reason: 'damaged', items: [{ orderItemId: line.id, quantity: 1 }] };
    expect((await stranger.shopper.call('post', `/orders/${o.number}/returns`, body)).status).toBe(
      404,
    );
    expect((await stranger.shopper.call('get', `/orders/${o.number}/returns`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/orders/${o.number}/returns`)).status).toBe(401);
    expect(
      (
        await o.buyer.shopper.call('post', `/orders/${o.number}/returns`, {
          reason: 'x',
          items: [],
        })
      ).status,
    ).toBe(400);
  });

  it('two simultaneous requests for the same units cannot both succeed', async () => {
    const o = await deliveredOrder(app, { quantity: 1 });
    const line = await lineOf(o.number);
    const body = { reason: 'damaged', items: [{ orderItemId: line.id, quantity: 1 }] };
    const results = await Promise.all([
      o.buyer.shopper.call('post', `/orders/${o.number}/returns`, body),
      o.buyer.shopper.call('post', `/orders/${o.number}/returns`, body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('leaves the order delivered', async () => {
    const o = await deliveredOrder(app);
    const line = await lineOf(o.number);
    await o.buyer.shopper.call('post', `/orders/${o.number}/returns`, {
      reason: 'damaged',
      items: [{ orderItemId: line.id, quantity: 1 }],
    });
    expect((await orderByNumber(o.number)).status).toBe('delivered');
    const history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, (await orderByNumber(o.number)).id));
    expect(history.some((h) => h.toStatus === 'refunded')).toBe(false);
  });
});

describe('GET /orders/:number/returns', () => {
  it('lists the returns and what is still returnable', async () => {
    const o = await deliveredOrder(app, { quantity: 3 });
    const line = await lineOf(o.number);
    const before = bodyOf<ListBody>(
      await o.buyer.shopper.call('get', `/orders/${o.number}/returns`),
    );
    expect(before.data.eligibility).toMatchObject({ eligible: true, reason: null });
    expect(before.data.eligibility.lines[0]).toMatchObject({ returnableQuantity: 3 });
    expect(before.data.eligibility.deadline).not.toBeNull();

    await o.buyer.shopper.call('post', `/orders/${o.number}/returns`, {
      reason: 'damaged',
      items: [{ orderItemId: line.id, quantity: 2 }],
    });
    const after = bodyOf<ListBody>(
      await o.buyer.shopper.call('get', `/orders/${o.number}/returns`),
    );
    expect(after.data.returns).toHaveLength(1);
    expect(after.data.eligibility.lines[0]).toMatchObject({ returnableQuantity: 1 });
  });

  it('explains why an undelivered order cannot be returned', async () => {
    const buyer = await signedIn(app);
    const placed = await placeOrder(app, { shopper: buyer.shopper, email: buyer.user.email });
    const res = bodyOf<ListBody>(
      await buyer.shopper.call('get', `/orders/${placed.number}/returns`),
    );
    expect(res.data.eligibility).toMatchObject({
      eligible: false,
      reason: 'Only a delivered order can be returned',
      deadline: null,
    });
  });
});
