import { weighedCents } from '@store/shared';
import { and, eq, sql } from 'drizzle-orm';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  emailOutbox,
  inventoryAdjustments,
  orderItems,
  orders,
  payments,
  pointsLedger,
} from '../../db/schema/index.ts';
import { DEFAULT_STORE_ID } from '../../db/seed/delivery.ts';
import { runJob } from '../../jobs/runner.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import type { PaymentIntentInfo } from '../../lib/stripe.ts';
import { makeTestApp } from '../../test/app.ts';
import { createCategory, createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf } from '../../test/http.ts';
import { orderByNumber, placeOrder, signedIn, simulate } from '../../test/orders.ts';
import { expectBatchInvariant } from '../../test/stock.ts';
import { createOutbox } from '../mail/outbox.ts';

import { deliverSimulated, dispatchOrder } from './dispatch.ts';

const log = pino({ level: 'silent' });
let fake: FakeStripe;
let app: ReturnType<typeof makeTestApp>;
let outbox: ReturnType<typeof createOutbox>;

// A gateway that proves the capture call is made with no lock on the order row: from a second
// connection it takes the row with NOWAIT, which fails at once if anything still holds it.
class ProbingStripe extends FakeStripe {
  lockFree: boolean | null = null;
  orderId: string | null = null;
  override async capturePaymentIntent(
    id: string,
    amountCents: number,
    key: string,
  ): Promise<PaymentIntentInfo> {
    if (this.orderId) {
      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`select id from orders where id = ${this.orderId} for update nowait`);
        });
        this.lockFree = true;
      } catch {
        this.lockFree = false;
      }
    }
    return super.capturePaymentIntent(id, amountCents, key);
  }
}

beforeEach(async () => {
  fake = new ProbingStripe();
  outbox = createOutbox({ transport: new MemoryTransport(), log });
  app = makeTestApp({ payments: fake, outbox });
  await createShippingMethods();
});
afterEach(expectBatchInvariant);

async function make(
  opts: {
    qty?: number;
    weight?: { pricePerKgCents: number; nominalGrams: number };
    price?: number;
  } = {},
) {
  const category = await createCategory();
  const p = await createProduct({
    name: opts.weight ? 'Loose bananas' : 'Greek yoghurt',
    categoryId: category.id,
    shelfLifeDays: 10,
    food: { allergens: ['milk'], dietary: ['vegetarian'] },
    variants: [
      {
        priceCents: opts.price ?? 200,
        stock: 30,
        ...(opts.weight && { weight: opts.weight }),
      },
    ],
  });
  const buyer = await signedIn(app, 'customer');
  const placed = await placeOrder(app, {
    shopper: buyer.shopper,
    email: buyer.user.email,
    variantId: p.variants[0]!.id,
    quantity: opts.qty ?? 3,
  });
  expect((await simulate(app, placed.number)).status).toBe(200);
  const order = await orderByNumber(placed.number);
  const admin = await signedIn(app, 'admin');
  return {
    number: placed.number,
    order,
    admin: admin.shopper,
    buyer,
    category,
    variant: p.variants[0]!.id,
  };
}
type Made = Awaited<ReturnType<typeof make>>;

const lines = (orderId: string) =>
  db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
const post = (m: Made, path: string, body?: object) =>
  m.admin.call('post', `/admin/orders/${m.number}${path}`, body);
const pick = (m: Made, itemId: string, body: object) => post(m, `/items/${itemId}/pick`, body);
const reload = () => undefined;
void reload;
const mails = async (orderId: string) =>
  (await db.select().from(emailOutbox).where(eq(emailOutbox.orderId, orderId))).map((e) => e.kind);
const deps = () => ({ gateway: fake, log });

describe('packing', () => {
  it('cannot complete with an unresolved line, then does once every line is done', async () => {
    const m = await make();
    const res = await post(m, '/pack');
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('not done yet');
    expect((await orderByNumber(m.number)).packedAt).toBeNull();
    const [line] = await lines(m.order.id);
    expect((await pick(m, line!.id, { action: 'found' })).status).toBe(200);
    const ok = await post(m, '/pack');
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const after = await orderByNumber(m.number);
    expect(after.packedAt).not.toBeNull();
    expect(after.status).toBe('processing');
    // A double click answers the same and writes nothing more.
    expect((await post(m, '/pack')).status).toBe(200);
    expect((await orderByNumber(m.number)).packedAt?.getTime()).toBe(after.packedAt?.getTime());
  });

  it('needs grams for a weighed line before the bag can close', async () => {
    const m = await make({ qty: 1, weight: { pricePerKgCents: 400, nominalGrams: 500 } });
    const [line] = await lines(m.order.id);
    expect((await post(m, '/pack')).status).toBe(422);
    expect((await pick(m, line!.id, { action: 'weigh', grams: 530 })).status).toBe(200);
    expect((await post(m, '/pack')).status).toBe(200);
  });

  it('writes off the units not found at the order store without touching the books', async () => {
    const m = await make({ qty: 3 });
    const [line] = await lines(m.order.id);
    const before = await db.execute<{ quantity: number }>(
      sql`select quantity from inventory where variant_id = ${m.variant} and store_id = ${DEFAULT_STORE_ID}`,
    );
    expect(
      (
        await m.admin.call('post', `/admin/orders/${m.number}/items/${line!.id}/shortfall`, {
          pickedQty: 1,
        })
      ).status,
    ).toBe(200);
    expect((await post(m, '/pack')).status).toBe(200);
    const rows = await db
      .select()
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.reason, 'not_found_at_pick'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variantId: m.variant, storeId: DEFAULT_STORE_ID, delta: 0 });
    expect(rows[0]?.note).toContain('2 of 3');
    const after = await db.execute<{ quantity: number }>(
      sql`select quantity from inventory where variant_id = ${m.variant} and store_id = ${DEFAULT_STORE_ID}`,
    );
    // The best match was not in stock here (no neighbours), so nothing else moved either.
    expect(after[0]?.quantity).toBe(before[0]?.quantity);
    // Packing twice writes the row once.
    await post(m, '/pack');
    expect(
      await db
        .select()
        .from(inventoryAdjustments)
        .where(eq(inventoryAdjustments.reason, 'not_found_at_pick')),
    ).toHaveLength(1);
  });
});

async function packed(m: Made, grams?: number) {
  const items = await lines(m.order.id);
  for (const i of items.filter((x) => x.pickStatus === 'pending' || x.pricePerKgCents !== null)) {
    const body =
      i.pricePerKgCents !== null ? { action: 'weigh', grams: grams ?? 500 } : { action: 'found' };
    expect((await pick(m, i.id, body)).status).toBe(200);
  }
  expect((await post(m, '/pack')).status).toBe(200);
}

describe('handing the bag to the rider', () => {
  it('refuses before the bag is packed', async () => {
    const m = await make();
    expect((await post(m, '/dispatch')).status).toBe(409);
    expect(fake.captured).toHaveLength(0);
  });

  it('captures the weighed amount once, freezes the grams, ships with a rider and queues the mails', async () => {
    const m = await make({ qty: 2, weight: { pricePerKgCents: 400, nominalGrams: 500 } });
    (fake as ProbingStripe).orderId = m.order.id;
    await packed(m, 560);
    const res = await post(m, '/dispatch');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const o = await orderByNumber(m.number);
    const [line] = await lines(m.order.id);
    expect(line).toMatchObject({ weighedGrams: 560, finalCents: weighedCents(400, 560) });
    expect(fake.captured).toHaveLength(1);
    expect(o.capturedCents).toBe(fake.captured[0]?.amountCents);
    expect(o.status).toBe('shipped');
    expect(o.riderName).toBeTruthy();
    expect(o.dispatchedAt).not.toBeNull();
    expect((await mails(m.order.id)).sort()).toEqual(
      ['order_confirmation', 'order_final_bill', 'order_shipped'].sort(),
    );
    // The network call ran while the order row was free to lock.
    expect((fake as ProbingStripe).lockFree).toBe(true);
    const detail = bodyOf<{ data: { order: { dispatch: { riderName: string } | null } } }>(res);
    expect(detail.data.order.dispatch?.riderName).toBe(o.riderName);
  });

  it('is a no-op the second time: no second capture, no second email, same rider and time', async () => {
    const m = await make();
    await packed(m);
    await post(m, '/dispatch');
    const first = await orderByNumber(m.number);
    const mailsBefore = await mails(m.order.id);
    const again = await post(m, '/dispatch');
    expect(again.status).toBe(200);
    const second = await orderByNumber(m.number);
    expect(second.dispatchedAt?.getTime()).toBe(first.dispatchedAt?.getTime());
    expect(second.riderName).toBe(first.riderName);
    expect(fake.captured).toHaveLength(1);
    expect(await mails(m.order.id)).toEqual(mailsBefore);
    // Same through the service, and two at once capture once.
    const [a, b] = await Promise.all([
      dispatchOrder(deps(), m.number, 'test'),
      dispatchOrder(deps(), m.number, 'test'),
    ]);
    expect([a.alreadyDispatched, b.alreadyDispatched]).toEqual([true, true]);
    expect(fake.captured).toHaveLength(1);
  });

  it('settles an unanswered replacement as accepted before it captures', async () => {
    const category = await createCategory();
    const mk = (name: string, price: number) =>
      createProduct({
        name,
        categoryId: category.id,
        shelfLifeDays: 10,
        food: { allergens: ['milk'], dietary: ['vegetarian'] },
        variants: [{ priceCents: price, stock: 20 }],
      });
    const orig = await mk('Greek yoghurt', 200);
    await mk('Close yoghurt', 190);
    const buyer = await signedIn(app, 'customer');
    const placed = await placeOrder(app, {
      shopper: buyer.shopper,
      email: buyer.user.email,
      variantId: orig.variants[0]!.id,
      quantity: 3,
    });
    await simulate(app, placed.number);
    const order = await orderByNumber(placed.number);
    const admin = (await signedIn(app, 'admin')).shopper;
    const [line] = await lines(order.id);
    const m = { number: placed.number, order, admin } as Made;
    expect(
      (
        await admin.call('post', `/admin/orders/${placed.number}/items/${line!.id}/shortfall`, {
          pickedQty: 1,
        })
      ).status,
    ).toBe(200);
    expect((await lines(order.id)).find((i) => i.substitutesItemId)?.swapStatus).toBe('proposed');
    expect((await pick(m, line!.id, { action: 'found' })).status).toBe(409);
    await post(m, '/pack');
    // Packed, still waiting for the shopper: the swap stays proposed until dispatch.
    expect((await lines(order.id)).find((i) => i.substitutesItemId)?.swapStatus).toBe('proposed');
    expect((await post(m, '/dispatch')).status).toBe(200);
    expect((await lines(order.id)).find((i) => i.substitutesItemId)?.swapStatus).toBe('accepted');
    // 1 x 200 packed + 2 x 190 replacement, plus the order's shipping.
    const o = await orderByNumber(placed.number);
    expect(o.capturedCents).toBe(order.totalCents - 400 + 380);
  });

  it('ships an order that was charged in full at checkout without capturing anything', async () => {
    const m = await make();
    await db
      .update(payments)
      .set({ captureMethod: 'automatic', status: 'succeeded' })
      .where(eq(payments.orderId, m.order.id));
    await packed(m);
    expect((await post(m, '/dispatch')).status).toBe(200);
    expect(fake.captured).toHaveLength(0);
    expect((await orderByNumber(m.number)).status).toBe('shipped');
  });

  it('keeps a failed capture retryable: nothing ships, and the retry captures once', async () => {
    const m = await make();
    await packed(m);
    const original = fake.capturePaymentIntent.bind(fake);
    let failNext = true;
    fake.capturePaymentIntent = (id, amount, key) => {
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('gateway down'));
      }
      return original(id, amount, key);
    };
    expect((await post(m, '/dispatch')).status).toBeGreaterThanOrEqual(500);
    const stuck = await orderByNumber(m.number);
    expect(stuck.status).toBe('processing');
    expect(stuck.dispatchedAt).toBeNull();
    expect((await post(m, '/dispatch')).status).toBe(200);
    expect(fake.captured).toHaveLength(1);
  });
});

describe('simulated delivery', () => {
  it('delivers when the simulated arrival has passed, once, and tells the shopper', async () => {
    const m = await make();
    const to = new Date('2026-11-21T15:00:00.000Z');
    await db
      .update(orders)
      .set({
        deliveryFrom: new Date('2026-11-21T14:00:00.000Z'),
        deliveryTo: to,
        deliveryKind: 'slot',
      })
      .where(eq(orders.id, m.order.id));
    await packed(m);
    const at = new Date('2026-11-21T14:20:00.000Z');
    await dispatchOrder(deps(), m.number, 'test', at);
    // Ride = 30 min (window end is 40 min away): arrives 14:50.
    expect(await deliverSimulated(new Date('2026-11-21T14:49:00.000Z'))).toMatchObject({
      delivered: 0,
    });
    expect((await orderByNumber(m.number)).status).toBe('shipped');
    const late = new Date('2026-11-21T14:51:00.000Z');
    expect(await deliverSimulated(late)).toMatchObject({ delivered: 1 });
    const o = await orderByNumber(m.number);
    expect(o.status).toBe('delivered');
    expect(o.deliveredAt?.getTime()).toBe(late.getTime());
    expect(await mails(m.order.id)).toContain('order_delivered');
    expect(await deliverSimulated(late)).toMatchObject({ delivered: 0 });
    expect((await mails(m.order.id)).filter((k) => k === 'order_delivered')).toHaveLength(1);
  });

  it('runs as the deliver-simulated job', async () => {
    const m = await make();
    await packed(m);
    await dispatchOrder(deps(), m.number, 'test', new Date(Date.now() - 3_600_000));
    const out = await runJob('deliver-simulated', { now: new Date(), log, gateway: fake, outbox });
    expect(out.status).toBe('ran');
    expect(out.result).toMatchObject({ delivered: 1 });
    expect((await orderByNumber(m.number)).status).toBe('delivered');
  });
});

describe('a replacement refused at the door', () => {
  async function shipped() {
    const category = await createCategory();
    const mk = (name: string, price: number) =>
      createProduct({
        name,
        categoryId: category.id,
        shelfLifeDays: 10,
        food: { allergens: ['milk'], dietary: ['vegetarian'] },
        variants: [{ priceCents: price, stock: 20 }],
      });
    const orig = await mk('Greek yoghurt', 200);
    await mk('Close yoghurt', 190);
    const buyer = await signedIn(app, 'customer');
    const placed = await placeOrder(app, {
      shopper: buyer.shopper,
      email: buyer.user.email,
      variantId: orig.variants[0]!.id,
      quantity: 3,
    });
    await simulate(app, placed.number);
    const order = await orderByNumber(placed.number);
    const admin = (await signedIn(app, 'admin')).shopper;
    const [line] = await lines(order.id);
    await admin.call('post', `/admin/orders/${placed.number}/items/${line!.id}/shortfall`, {
      pickedQty: 1,
    });
    const m = { number: placed.number, order, admin } as Made;
    await pick(m, line!.id, { action: 'found' }).catch(() => undefined);
    await post(m, '/pack');
    await post(m, '/dispatch');
    return { m, swap: (await lines(order.id)).find((i) => i.substitutesItemId)!, buyer };
  }

  it('takes back the loyalty points that line earned', async () => {
    const { m, swap, buyer } = await shipped();
    const points = async () =>
      (await db.select().from(pointsLedger).where(eq(pointsLedger.userId, buyer.user.id))).reduce(
        (n, r) => n + r.delta,
        0,
      );
    const earned =
      (
        await db
          .select()
          .from(pointsLedger)
          .where(and(eq(pointsLedger.userId, buyer.user.id), eq(pointsLedger.kind, 'earn')))
      )[0]?.delta ?? 0;
    expect(earned).toBeGreaterThan(0);
    const before = await points();
    const res = await m.admin.call(
      'post',
      `/admin/orders/${m.number}/swaps/${swap.id}/reject-at-door`,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const base = m.order.subtotalCents - m.order.discountCents;
    const back = Math.floor((earned * 380) / base);
    expect(back).toBeGreaterThan(0);
    expect(await points()).toBe(before - back);
    // Repeating the refusal takes nothing more.
    await m.admin.call('post', `/admin/orders/${m.number}/swaps/${swap.id}/reject-at-door`);
    expect(await points()).toBe(before - back);
  });

  it('is refused once the order is delivered', async () => {
    const { m, swap } = await shipped();
    await deliverSimulated(new Date(Date.now() + 3_600_000));
    const res = await m.admin.call(
      'post',
      `/admin/orders/${m.number}/swaps/${swap.id}/reject-at-door`,
    );
    expect(res.status).toBe(409);
  });
});

void pointsLedger;
void orders;
