import { weighedCents } from '@store/shared';
import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { emailOutbox, orderItems, returns } from '../../db/schema/index.ts';
import { DEFAULT_STORE_ID } from '../../db/seed/delivery.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp } from '../../test/app.ts';
import { createCategory, createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf } from '../../test/http.ts';
import {
  captureOrder,
  orderByNumber,
  placeOrder,
  signedIn,
  simulate,
  stockOf,
} from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';
import { batchesOf, expectBatchInvariant, setBatches } from '../../test/stock.ts';
import { finalAmountCents, finalizeOrder } from '../checkout/capture.ts';
import { createOutbox } from '../mail/outbox.ts';
import { transitionOrder } from '../orders/service.ts';
import { assessEligibility } from '../returns/eligibility.ts';

import { rejectAtDoor } from './door.ts';
import { signSwap } from './swaps.ts';

const log = pino({ level: 'silent' });
let fake: FakeStripe;
let transport: MemoryTransport;
let app: ReturnType<typeof makeTestApp>;
let deps: { gateway: FakeStripe; log: typeof log };

beforeEach(async () => {
  fake = new FakeStripe();
  transport = new MemoryTransport();
  app = makeTestApp({ payments: fake, outbox: createOutbox({ transport, log }) });
  deps = { gateway: fake, log };
  await createShippingMethods();
});
afterEach(expectBatchInvariant);

type Food = { allergens?: string[]; dietary?: string[] };

// A yoghurt shelf: the ordered product and any neighbours in the same subcategory.
async function shelf(
  original: { price?: number; stock?: number } = {},
  neighbours: ({ name: string; price: number; stock?: number } & Food & {
      weight?: { pricePerKgCents: number; nominalGrams: number };
    })[] = [],
) {
  const category = await createCategory();
  const make = (name: string, price: number, stock: number, food: Food, weight?: object) =>
    createProduct({
      name,
      categoryId: category.id,
      shelfLifeDays: 10,
      food: { allergens: food.allergens ?? ['milk'], dietary: food.dietary ?? ['vegetarian'] },
      variants: [{ priceCents: price, stock, ...(weight && { weight: weight as never }) }],
    });
  const orig = await make('Greek yoghurt', original.price ?? 200, original.stock ?? 10, {});
  const others = [];
  for (const n of neighbours) {
    others.push(await make(n.name, n.price, n.stock ?? 10, n, n.weight));
  }
  return { orig, others, variant: orig.variants[0]!.id, category };
}

async function paidOrder(
  s: Awaited<ReturnType<typeof shelf>>,
  opts: { qty?: number; pref?: 'best_match' | 'specific' | 'none'; specific?: string } = {},
) {
  const buyer = await signedIn(app, 'customer');
  const placed = await placeOrder(app, {
    shopper: buyer.shopper,
    email: buyer.user.email,
    variantId: s.variant,
    quantity: opts.qty ?? 3,
  });
  expect((await simulate(app, placed.number)).status).toBe(200);
  const order = await orderByNumber(placed.number);
  await db
    .update(orderItems)
    .set({
      substitution: opts.pref ?? 'best_match',
      substituteVariantId: opts.specific ?? null,
    })
    .where(eq(orderItems.orderId, order.id));
  const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const admin = await signedIn(
    app,
    'admin',
    `boss${Math.random().toString(36).slice(2, 7)}@grocery.test`,
  );
  return { ...placed, order, line: line!, buyer, admin };
}

const lines = async (orderId: string) =>
  db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
// The order's own lines: a 6.00 basket is under the minimum order, so checkout adds a filler line
// ("Test product N", see the test shopper) that has nothing to do with swaps.
const shelfLines = async (orderId: string) =>
  (await lines(orderId)).filter((i) => !i.productName.startsWith('Test product'));
const swapOf = async (orderId: string) => (await lines(orderId)).find((i) => i.substitutesItemId)!;

function short(
  p: Awaited<ReturnType<typeof paidOrder>>,
  body: { pickedQty: number; substituteVariantId?: string },
) {
  return p.admin.shopper.call(
    'post',
    `/admin/orders/${p.number}/items/${p.line.id}/shortfall`,
    body,
  );
}

describe('recording a shortfall', () => {
  it('proposes the closest safe match at min(price) and takes its packs oldest first at the order store', async () => {
    const s = await shelf({}, [
      { name: 'Close yoghurt', price: 190, stock: 8 },
      { name: 'Pricey yoghurt', price: 230 },
    ]);
    const close = s.others[0]!.variants[0]!.id;
    await setBatches(DEFAULT_STORE_ID, close, [
      { bestBefore: '2027-01-10', quantity: 3 },
      { bestBefore: '2027-01-05', quantity: 5 },
    ]);
    const p = await paidOrder(s);
    const res = await short(p, { pickedQty: 1 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const swap = await swapOf(p.order.id);
    expect(swap).toMatchObject({
      variantId: close,
      quantity: 2,
      unitPriceCents: 190, // min(190, 200)
      lineTotalCents: 380,
      swapStatus: 'proposed',
      substitutesItemId: p.line.id,
    });
    const original = (await lines(p.order.id)).find((i) => i.id === p.line.id)!;
    expect(original).toMatchObject({ pickStatus: 'substituted', pickedQty: 1 });
    // FEFO: the oldest batch gave the two packs; the stock row and batches moved together.
    expect(
      (await batchesOf(DEFAULT_STORE_ID, close)).map((b) => [b.bestBefore, b.quantity]),
    ).toEqual([
      ['2027-01-05', 3],
      ['2027-01-10', 3],
    ]);
    expect(await stockOf(close)).toEqual({ quantity: 6, reserved: 0 });
    // The mail is owed, with signed links for the open swap.
    const mails = await db.select().from(emailOutbox).where(eq(emailOutbox.orderId, p.order.id));
    const swapsMail = mails.find((m) => m.kind === 'order_swaps')!;
    const payload = swapsMail.payload as { links: { itemId: string; acceptUrl: string }[] };
    expect(payload.links[0]!.itemId).toBe(swap.id);
    expect(payload.links[0]!.acceptUrl).toContain(`token=${signSwap(swap.id)}`);
  });

  it('never charges the substitute above the original, even when it costs more', async () => {
    const s = await shelf({ price: 200 }, [{ name: 'Pricey yoghurt', price: 250 }]);
    const p = await paidOrder(s);
    await short(p, { pickedQty: 0 });
    expect(await swapOf(p.order.id)).toMatchObject({
      unitPriceCents: 200,
      quantity: 3,
      lineTotalCents: 600,
    });
    expect((await lines(p.order.id)).find((i) => i.id === p.line.id)).toMatchObject({
      pickStatus: 'substituted',
      pickedQty: 0,
    });
  });

  it('never picks a candidate with an allergen the original lacks, even when it is the closest', async () => {
    const s = await shelf({}, [
      { name: 'Nut yoghurt', price: 200, allergens: ['milk', 'nuts'] },
      { name: 'Meat jelly', price: 200, dietary: [] },
      { name: 'Safe but dearer', price: 255 },
    ]);
    const p = await paidOrder(s);
    await short(p, { pickedQty: 1 });
    const swap = await swapOf(p.order.id);
    expect(swap.variantId).toBe(s.others[2]!.variants[0]!.id);
  });

  it('refuses a packer pick that is not a safe match, changing nothing', async () => {
    const s = await shelf({}, [{ name: 'Nut yoghurt', price: 200, allergens: ['milk', 'nuts'] }]);
    const p = await paidOrder(s);
    const before = await stockOf(s.others[0]!.variants[0]!.id);
    const res = await short(p, {
      pickedQty: 1,
      substituteVariantId: s.others[0]!.variants[0]!.id,
    });
    expect(res.status).toBe(422);
    expect((await lines(p.order.id)).every((i) => i.pickStatus === 'pending')).toBe(true);
    expect(await stockOf(s.others[0]!.variants[0]!.id)).toEqual(before);
  });

  it('with no replacement in stock the line is short or missing, nothing else happens', async () => {
    const s = await shelf({}, [{ name: 'Sold out', price: 200, stock: 0 }]);
    const p = await paidOrder(s);
    await short(p, { pickedQty: 2 });
    const rows = await shelfLines(p.order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pickStatus: 'short', pickedQty: 2 });
  });

  it('"refund it" never gets a replacement, and a packer asking for one is refused', async () => {
    const s = await shelf({}, [{ name: 'Close yoghurt', price: 200 }]);
    const p = await paidOrder(s, { pref: 'none' });
    expect(
      (await short(p, { pickedQty: 0, substituteVariantId: s.others[0]!.variants[0]!.id })).status,
    ).toBe(422);
    expect((await short(p, { pickedQty: 0 })).status).toBe(200);
    const rows = await shelfLines(p.order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pickStatus: 'missing', pickedQty: 0 });
  });

  it('"this specific product" only ever uses that product, and only while it is safe and in stock', async () => {
    const s = await shelf({}, [
      { name: 'Closest', price: 200 },
      { name: 'Chosen', price: 240 },
    ]);
    const chosen = s.others[1]!.variants[0]!.id;
    const p = await paidOrder(s, { pref: 'specific', specific: chosen });
    expect(
      (await short(p, { pickedQty: 1, substituteVariantId: s.others[0]!.variants[0]!.id })).status,
    ).toBe(422);
    expect((await short(p, { pickedQty: 1 })).status).toBe(200);
    expect((await swapOf(p.order.id)).variantId).toBe(chosen);
  });

  it('a chosen product that became unsafe is not swapped in', async () => {
    const s = await shelf({}, [{ name: 'Chosen', price: 220 }]);
    const chosen = s.others[0]!;
    const p = await paidOrder(s, { pref: 'specific', specific: chosen.variants[0]!.id });
    await db.execute(
      (await import('drizzle-orm'))
        .sql`update products set allergens = '{milk,nuts}' where id = ${chosen.product.id}`,
    );
    await short(p, { pickedQty: 1 });
    expect((await lines(p.order.id)).filter((i) => i.substitutesItemId)).toHaveLength(0);
  });

  it('is idempotent for the same answer and refuses a different one', async () => {
    const s = await shelf({}, [{ name: 'Close yoghurt', price: 190 }]);
    const p = await paidOrder(s);
    const first = bodyOf<{ data: { substituteItemId: string } }>(
      await short(p, { pickedQty: 1 }),
    ).data;
    const again = bodyOf<{ data: { substituteItemId: string } }>(
      await short(p, { pickedQty: 1 }),
    ).data;
    expect(again.substituteItemId).toBe(first.substituteItemId);
    expect((await lines(p.order.id)).filter((i) => i.substitutesItemId)).toHaveLength(1);
    expect((await short(p, { pickedQty: 2 })).status).toBe(409);
  });

  it("refuses nonsense: all units found, a captured order, a stranger, another order's line", async () => {
    const s = await shelf({}, [{ name: 'Close yoghurt', price: 190 }]);
    const p = await paidOrder(s);
    expect((await short(p, { pickedQty: 3 })).status).toBe(422);
    const customer = await signedIn(app, 'customer');
    expect(
      (
        await customer.shopper.call(
          'post',
          `/admin/orders/${p.number}/items/${p.line.id}/shortfall`,
          { pickedQty: 1 },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await p.admin.shopper.call(
          'post',
          `/admin/orders/GR-2026-999999/items/${p.line.id}/shortfall`,
          { pickedQty: 1 },
        )
      ).status,
    ).toBe(404);
    await captureOrder(app, p.number);
    expect((await short(p, { pickedQty: 1 })).status).toBe(409);
  });
});

describe('a crowded subcategory', () => {
  it('accepts a packer pick that is safe even when more than fifty products are closer in price', async () => {
    const s = await shelf({ price: 200 }, [{ name: 'Far but safe', price: 255 }]);
    for (let i = 0; i < 55; i++) {
      await createProduct({
        name: `Same price ${i}`,
        categoryId: s.category.id,
        shelfLifeDays: 10,
        food: { allergens: ['milk'], dietary: ['vegetarian'] },
        variants: [{ priceCents: 200 }],
      });
    }
    const p = await paidOrder(s);
    const res = await short(p, {
      pickedQty: 1,
      substituteVariantId: s.others[0]!.variants[0]!.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await swapOf(p.order.id)).variantId).toBe(s.others[0]!.variants[0]!.id);
  });
});

describe('the shopper answers', () => {
  async function proposed() {
    const s = await shelf({}, [{ name: 'Close yoghurt', price: 190, stock: 8 }]);
    const close = s.others[0]!.variants[0]!.id;
    await setBatches(DEFAULT_STORE_ID, close, [
      { bestBefore: '2027-01-10', quantity: 3 },
      { bestBefore: '2027-01-05', quantity: 5 },
    ]);
    const p = await paidOrder(s);
    await short(p, { pickedQty: 1 });
    return { s, p, close, swap: await swapOf(p.order.id) };
  }
  const answer = (
    who: { call: (m: 'post', path: string, body?: object) => Promise<{ status: number }> },
    p: { number: string },
    itemId: string,
    body: object,
  ) => who.call('post', `/orders/${p.number}/swaps/${itemId}`, body);

  it('accepting charges the replacement at the capture; the missing units are not charged', async () => {
    const { p, swap } = await proposed();
    expect((await answer(p.buyer.shopper, p, swap.id, { decision: 'accept' })).status).toBe(200);
    expect((await swapOf(p.order.id)).swapStatus).toBe('accepted');
    const done = await finalizeOrder(deps, p.order.id, { actor: 'test' });
    // total - 3 x 200 + 1 x 200 (found) + 2 x 190 (replacement)
    expect(done.capturedCents).toBe(p.order.totalCents - 600 + 200 + 380);
  });

  it('rejecting gives the packs back to the batches they came from and charges nothing for the gap', async () => {
    const { p, swap, close } = await proposed();
    expect((await answer(p.buyer.shopper, p, swap.id, { decision: 'reject' })).status).toBe(200);
    expect(await swapOf(p.order.id)).toMatchObject({ swapStatus: 'rejected' });
    expect(
      (await batchesOf(DEFAULT_STORE_ID, close)).map((b) => [b.bestBefore, b.quantity]),
    ).toEqual([
      ['2027-01-05', 5],
      ['2027-01-10', 3],
    ]);
    expect(await stockOf(close)).toEqual({ quantity: 8, reserved: 0 });
    expect((await lines(p.order.id)).find((i) => i.id === p.line.id)!.pickStatus).toBe('short');
    const done = await finalizeOrder(deps, p.order.id, { actor: 'test' });
    expect(done.capturedCents).toBe(p.order.totalCents - 600 + 200);
  });

  it('is idempotent for the same answer, a 409 for the opposite one', async () => {
    const { p, swap } = await proposed();
    await answer(p.buyer.shopper, p, swap.id, { decision: 'reject' });
    expect((await answer(p.buyer.shopper, p, swap.id, { decision: 'reject' })).status).toBe(200);
    expect((await answer(p.buyer.shopper, p, swap.id, { decision: 'accept' })).status).toBe(409);
  });

  it('counts an unanswered swap as accepted when the order is captured', async () => {
    const { p } = await proposed();
    const done = await finalizeOrder(deps, p.order.id, { actor: 'test' });
    expect(done.capturedCents).toBe(p.order.totalCents - 600 + 200 + 380);
    expect((await swapOf(p.order.id)).swapStatus).toBe('accepted');
  });

  it('counts an unanswered swap as accepted when the order is dispatched', async () => {
    const { p } = await proposed();
    await finalizeOrder(deps, p.order.id, { actor: 'test' }).catch(() => undefined);
    // a fresh order, shipped without capture first
    const s2 = await shelf({}, [{ name: 'Other close', price: 190 }]);
    const q = await paidOrder(s2);
    await short(q, { pickedQty: 1 });
    await transitionOrder({ gateway: fake, log }, q.number, 'processing', {
      actor: 'test',
      note: null,
    });
    await transitionOrder({ gateway: fake, log }, q.number, 'shipped', {
      actor: 'test',
      note: null,
    });
    expect((await swapOf(q.order.id)).swapStatus).toBe('accepted');
  });

  it('only the owner or the signed link may answer, and not after the bag has left', async () => {
    const { p, swap } = await proposed();
    const stranger = await signedIn(app, 'customer');
    expect((await answer(stranger.shopper, p, swap.id, { decision: 'reject' })).status).toBe(404);
    const anonymous = makeShopper(app);
    expect((await answer(anonymous, p, swap.id, { decision: 'reject' })).status).toBe(404);
    expect(
      (await answer(anonymous, p, swap.id, { decision: 'reject', token: `${signSwap(swap.id)}x` }))
        .status,
    ).toBe(404);
    // A token made for another line does not open this one.
    expect(
      (await answer(anonymous, p, swap.id, { decision: 'reject', token: signSwap(p.line.id) }))
        .status,
    ).toBe(404);
    expect(
      (await answer(anonymous, p, swap.id, { decision: 'accept', token: signSwap(swap.id) }))
        .status,
    ).toBe(200);
    // After capture the bag is closed: the answer moves to the door.
    const s2 = await shelf({}, [{ name: 'Other close', price: 190 }]);
    const q = await paidOrder(s2);
    await short(q, { pickedQty: 1 });
    const swap2 = await swapOf(q.order.id);
    await captureOrder(app, q.number);
    expect((await answer(q.buyer.shopper, q, swap2.id, { decision: 'reject' })).status).toBe(409);
  });

  it('cancelling after a rejected swap does not put the rejected replacement back a second time', async () => {
    const { s, p, swap, close } = await proposed();
    await answer(p.buyer.shopper, p, swap.id, { decision: 'reject' });
    await transitionOrder({ gateway: fake, log }, p.number, 'cancelled', {
      actor: 'test',
      note: null,
    });
    expect(await stockOf(close)).toEqual({ quantity: 8, reserved: 0 });
    expect(await stockOf(s.variant)).toEqual({ quantity: 8, reserved: 0 });
  });

  it('cancelling a paid order after a swap puts back only what was packed and the accepted replacement', async () => {
    const { s, p, swap, close } = await proposed();
    await answer(p.buyer.shopper, p, swap.id, { decision: 'accept' });
    await transitionOrder({ gateway: fake, log }, p.number, 'cancelled', {
      actor: 'test',
      note: null,
    });
    // 10 in stock, 3 ordered, 2 not found (gone): 7 + 1 found goes back.
    expect(await stockOf(s.variant)).toEqual({ quantity: 8, reserved: 0 });
    expect(await stockOf(close)).toEqual({ quantity: 8, reserved: 0 });
  });
});

describe('what the shopper can read', () => {
  it('the customer order carries the replacement with its list price, and tracking lists the change without money', async () => {
    const s = await shelf({ price: 200 }, [{ name: 'Pricey yoghurt', price: 250 }]);
    const p = await paidOrder(s);
    await short(p, { pickedQty: 1 });
    const res = await p.buyer.shopper.call('get', `/account/orders/${p.number}`);
    const items = bodyOf<{
      data: {
        items: {
          substitutesItemId: string | null;
          unitPriceCents: number;
          listPriceCents: number | null;
          swapStatus: string | null;
        }[];
      };
    }>(res).data.items;
    const swap = items.find((i) => i.substitutesItemId)!;
    expect(swap).toMatchObject({
      unitPriceCents: 200,
      listPriceCents: 250,
      swapStatus: 'proposed',
    });

    const track = await makeShopper(app).call('post', '/orders/track', {
      orderNumber: p.number,
      email: p.buyer.user.email,
    });
    const tracked = bodyOf<{ data: { changes: unknown[]; items: unknown[] } }>(track).data;
    expect(tracked.changes).toEqual([
      {
        name: 'Greek yoghurt',
        picked: 1,
        quantity: 3,
        replacement: { name: 'Pricey yoghurt', quantity: 2, status: 'proposed' },
      },
    ]);
    expect(JSON.stringify(tracked)).not.toContain('250');
  });
});

describe('a weighed replacement', () => {
  it('follows the weight rules and is capped at the price of the units it replaces', async () => {
    const s = await shelf({ price: 250 }, [
      {
        name: 'Loose yoghurt',
        price: 200,
        weight: { pricePerKgCents: 400, nominalGrams: 500 },
      },
    ]);
    const p = await paidOrder(s, { qty: 2 });
    await short(p, { pickedQty: 0 });
    const swap = await swapOf(p.order.id);
    // Estimate 200 per unit, original 250: charged per unit at min = 200, price per kg kept.
    expect(swap).toMatchObject({ unitPriceCents: 200, quantity: 2, pricePerKgCents: 400 });
    // 1300 g would be 520, above 2 x 250: capped at what the original units cost.
    const done = await finalizeOrder(deps, p.order.id, {
      actor: 'test',
      weights: [{ orderItemId: swap.id, grams: 1300 }],
    });
    expect(weighedCents(400, 1300)).toBe(520);
    expect((await swapOf(p.order.id)).finalCents).toBe(500);
    expect(done.capturedCents).toBe(p.order.totalCents - 500 + 500);
  });
});

describe('refusing a replacement at the door', () => {
  async function captured() {
    const s = await shelf({}, [{ name: 'Close yoghurt', price: 190 }]);
    const p = await paidOrder(s);
    await short(p, { pickedQty: 1 });
    const swap = await swapOf(p.order.id);
    await captureOrder(app, p.number); // unanswered: accepted, charged 380 for the swap
    return { p, swap };
  }
  const door = (p: Awaited<ReturnType<typeof paidOrder>>, itemId: string) =>
    p.admin.shopper.call('post', `/admin/orders/${p.number}/swaps/${itemId}/reject-at-door`);

  it('refunds exactly that line through the refund path and records it on the order', async () => {
    const { p, swap } = await captured();
    const res = await door(p, swap.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(bodyOf<{ data: { refundedCents: number } }>(res).data.refundedCents).toBe(380);
    const intent = (await db.select().from((await import('../../db/schema/index.ts')).payments))[0]!
      .providerPaymentIntentId!;
    expect(fake.refundedCents(intent)).toBe(380);
    const order = await orderByNumber(p.number);
    expect(order.refundedCents).toBe(380);
    expect(await swapOf(p.order.id)).toMatchObject({ swapStatus: 'rejected', refundedCents: 380 });
  });

  it('is idempotent: repeating it, even after the provider forgot the key, refunds once', async () => {
    const { p, swap } = await captured();
    await door(p, swap.id);
    const again = await door(p, swap.id);
    expect(again.status).toBe(200);
    expect(bodyOf<{ data: { alreadyRefunded: boolean } }>(again).data.alreadyRefunded).toBe(true);
    expect(fake.refunded).toHaveLength(1);
    expect((await orderByNumber(p.number)).refundedCents).toBe(380);
  });

  it('continues after a crash between the refund and the record, without a second refund', async () => {
    const { p, swap } = await captured();
    const [payment] = await db.select().from((await import('../../db/schema/index.ts')).payments);
    // Step 1 and 2 happened (intent written, money moved), step 3 did not.
    await db
      .update(orderItems)
      .set({ refundIntentAt: new Date() })
      .where(eq(orderItems.id, swap.id));
    await fake.refundPaymentIntent(
      payment!.providerPaymentIntentId!,
      `swap-refund:${swap.id}`,
      380,
      {
        order_item_id: swap.id,
      },
    );
    fake.expireIdempotencyKeys(); // a retry days later: the key is gone, the metadata is not
    const res = await door(p, swap.id);
    expect(res.status).toBe(200);
    expect(fake.refunded).toHaveLength(1);
    expect(fake.refundedCents(payment!.providerPaymentIntentId!)).toBe(380);
    expect((await orderByNumber(p.number)).refundedCents).toBe(380);
  });

  it('needs a capture first and a replacement that was accepted', async () => {
    const s = await shelf({}, [{ name: 'Close yoghurt', price: 190 }]);
    const p = await paidOrder(s);
    await short(p, { pickedQty: 1 });
    const swap = await swapOf(p.order.id);
    expect((await door(p, swap.id)).status).toBe(409);
    expect(fake.refunded).toHaveLength(0);
    // Rejected before dispatch: nothing was charged, so nothing to refund.
    await p.buyer.shopper.call('post', `/orders/${p.number}/swaps/${swap.id}`, {
      decision: 'reject',
    });
    await captureOrder(app, p.number);
    expect((await door(p, swap.id)).status).toBe(409);
    expect((await door(p, p.line.id)).status).toBe(404);
  });

  it('the refused line cannot be returned afterwards, and rejected lines hold no stock', async () => {
    const { p, swap } = await captured();
    await door(p, swap.id);
    const rows = await lines(p.order.id);
    const result = assessEligibility({
      status: 'delivered',
      deliveredAt: new Date(),
      windowDays: 30,
      now: new Date(),
      lines: rows,
      counted: new Map(),
    });
    expect(result.returnable.get(swap.id)).toBe(0);
    // The original found 1 of 3: at most that one unit can come back.
    expect(result.returnable.get(p.line.id)).toBe(1);
    expect(await db.select().from(returns).where(eq(returns.orderId, p.order.id))).toHaveLength(0);
  });

  it('calls the gateway nowhere when the replacement was free', async () => {
    const { p, swap } = await captured();
    await db
      .update(orderItems)
      .set({ unitPriceCents: 0, lineTotalCents: 0 })
      .where(eq(orderItems.id, swap.id));
    const done = await rejectAtDoor(
      { gateway: fake, log, simulated: false },
      p.number,
      swap.id,
      'test',
    );
    expect(done.refundedCents).toBe(0);
    expect(fake.refunded).toHaveLength(0);
  });
});

describe('finalAmountCents with substitutions', () => {
  const order = { totalCents: 2000, authorizedCents: 2000 };
  const line = (over: object) => ({
    lineTotalCents: 600,
    finalCents: null,
    quantity: 3,
    discountCents: 0,
    pickedQty: null,
    substitutesItemId: null,
    swapStatus: null,
    ...over,
  });

  it('charges nothing for missing units and only the found ones for a short line', () => {
    expect(finalAmountCents(order, [line({ pickedQty: 0 })]).amountCents).toBe(1400);
    expect(finalAmountCents(order, [line({ pickedQty: 1 })]).amountCents).toBe(1600);
  });
  it('scales the line discount with the units found, round half up', () => {
    // 3 x 200, discount 100 (paid 500, in the total). One found: line 200, discount 33 -> 167.
    const o = { totalCents: 1500, authorizedCents: 1500 };
    expect(finalAmountCents(o, [line({ discountCents: 100, pickedQty: 1 })]).amountCents).toBe(
      1500 - 500 + 167,
    );
  });
  it('adds a replacement unless it was rejected; unanswered counts as accepted', () => {
    const sub = (swapStatus: string) =>
      line({ lineTotalCents: 380, quantity: 2, pickedQty: 2, substitutesItemId: 'o', swapStatus });
    const base = line({ pickedQty: 1 });
    expect(finalAmountCents(order, [base, sub('accepted')]).amountCents).toBe(1600 + 380);
    expect(finalAmountCents(order, [base, sub('proposed')]).amountCents).toBe(1600 + 380);
    expect(finalAmountCents(order, [base, sub('rejected')]).amountCents).toBe(1600);
  });
  it('caps at the authorised amount and never goes below zero', () => {
    const sub = line({ lineTotalCents: 900, substitutesItemId: 'o', swapStatus: 'accepted' });
    expect(finalAmountCents(order, [sub])).toEqual({ amountCents: 2000, capped: true });
    expect(
      finalAmountCents({ totalCents: 300, authorizedCents: 300 }, [line({ pickedQty: 0 })]),
    ).toEqual({ amountCents: 0, capped: false });
  });
  it('a weighed line that is short keeps its weighed price for the units found', () => {
    const weighed = line({ lineTotalCents: 600, finalCents: 250, pickedQty: 1 });
    expect(finalAmountCents(order, [weighed]).amountCents).toBe(2000 - 600 + 250);
  });
});
