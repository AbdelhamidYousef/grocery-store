import { BASKET_RULES, isPeakSlot } from '@store/shared';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { orderItems, orders, payments } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods, stockAt } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { orderByNumber, placeOrder, signedIn, simulate, TEST_ADDRESS } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';
import { generateSlots } from '../delivery/slot-generation.ts';

import { finalAmountCents } from './capture.ts';

let stripe: FakeStripe;
let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  stripe = new FakeStripe();
  app = makeTestApp({ payments: stripe });
  await createShippingMethods();
});

// Shoppers here never get a filler line: these tests are about the goods under the minimum.
const shopperAt = (postcode?: string) =>
  makeShopper(app, undefined, undefined, postcode, { autoTopUp: false });
const body = (postalCode = '10115', extra: object = {}) => ({
  email: 'ada@grocery.test',
  shippingAddress: { ...TEST_ADDRESS, postalCode },
  shippingMethodCode: 'standard',
  ...extra,
});
interface Bill {
  goodsCents: number;
  depositCents: number;
  bagCount: number;
  bagFeeCents: number;
  deliveryFeeCents: number;
  deliveryFeeBeforeFreeCents: number;
  deliveryFree: boolean;
  totalCents: number;
  bags: boolean;
  minimumOrder: { missingCents: number; met: boolean };
  freeDelivery: { missingCents: number; reached: boolean } | null;
  canCheckout: boolean;
}
const cartBill = async (s: ReturnType<typeof shopperAt>) =>
  bodyOf<{ data: { pricing: { bill: Bill } } }>(await s.call('get', '/cart')).data.pricing.bill;
const placedNumber = (res: { body: unknown }) =>
  (res.body as { data: { orderNumber: string } }).data.orderNumber;

describe('the minimum order', () => {
  it('blocks checkout under 15.00 of goods, says what is missing and reserves nothing', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1180, stock: 5 }] });
    const shopper = shopperAt();
    await shopper.addToCart(variants[0]!.id, 1);
    expect(await cartBill(shopper)).toMatchObject({
      canCheckout: false,
      minimumOrder: { met: false, missingCents: 320 },
    });
    const res = await shopper.call('post', '/checkout', body());
    expect(res.status).toBe(422);
    expect(errorOf(res)).toMatchObject({
      code: 'BELOW_MINIMUM_ORDER',
      details: { missingCents: 320, minCents: BASKET_RULES.minOrderCents },
    });
    expect(errorOf(res).message).toContain('€3.20');
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(stripe.calls).toHaveLength(0);
  });

  it('lets exactly 15.00 through', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1500, stock: 5 }] });
    const shopper = shopperAt();
    await shopper.addToCart(variants[0]!.id, 1);
    expect((await cartBill(shopper)).canCheckout).toBe(true);
    expect((await shopper.call('post', '/checkout', body())).status).toBe(200);
  });

  it('does not count the bottle deposit', async () => {
    // 14.00 of goods + 2.00 of deposit is 16.00 on the card, still under the minimum.
    const { variants } = await createProduct({
      variants: [{ priceCents: 175, depositCents: 25, stock: 20 }],
    });
    const shopper = shopperAt();
    await shopper.addToCart(variants[0]!.id, 8);
    expect(await cartBill(shopper)).toMatchObject({
      goodsCents: 1400,
      depositCents: 200,
      canCheckout: false,
      minimumOrder: { missingCents: 100 },
    });
    expect((await shopper.call('post', '/checkout', body())).status).toBe(422);
  });

  it('is judged after a discount code, on the server', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1600, stock: 5 }] });
    const { discountCodes } = await import('../../db/schema/index.ts');
    await db.insert(discountCodes).values({ code: 'TEN', kind: 'percent', value: 10 });
    const shopper = shopperAt();
    await shopper.addToCart(variants[0]!.id, 1);
    await shopper.call('post', '/cart/code', { code: 'TEN' });
    expect(await cartBill(shopper)).toMatchObject({
      goodsCents: 1440,
      minimumOrder: { missingCents: 60 },
    });
    expect((await shopper.call('post', '/checkout', body())).status).toBe(422);
  });
});

describe('one bill for the cart and the order', () => {
  it('the cart shows what the order stores: goods, deposit, bags, delivery', async () => {
    const { variants } = await createProduct({
      variants: [{ priceCents: 400, depositCents: 25, stock: 30 }],
    });
    const shopper = shopperAt();
    await shopper.addToCart(variants[0]!.id, 9); // 36.00 of goods, 2.25 deposit, 2 bags
    await shopper.pickSlot();
    const bill = await cartBill(shopper);
    expect(bill).toMatchObject({
      goodsCents: 3600,
      depositCents: 225,
      bagCount: 2,
      bagFeeCents: 50,
      deliveryFeeCents: 299,
      totalCents: 3600 + 225 + 50 + 299,
    });
    const res = await shopper.call('post', '/checkout', body());
    expect(res.status).toBe(200);
    const order = await orderByNumber(placedNumber(res));
    expect(order).toMatchObject({
      subtotalCents: 3600,
      depositCents: 225,
      bagFeeCents: 50,
      shippingCents: 299,
      deliveryFeeCents: 299,
      totalCents: bill.totalCents,
    });
    // The card is authorised for exactly that: nothing is weighed, so there is no buffer.
    expect(order.authorizedCents).toBe(bill.totalCents);
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(payment?.amountCents).toBe(bill.totalCents);
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(line?.depositCents).toBe(25);
  });

  it('does not let the deposit buy free delivery: 48.00 of goods plus 2.50 of deposit still pays 2.99', async () => {
    const { variants } = await createProduct({
      variants: [{ priceCents: 480, depositCents: 25, stock: 30 }],
    });
    const shopper = shopperAt();
    await shopper.addToCart(variants[0]!.id, 10);
    await shopper.pickSlot();
    expect(await cartBill(shopper)).toMatchObject({
      goodsCents: 4800,
      depositCents: 250,
      deliveryFeeCents: 299,
      deliveryFree: false,
      freeDelivery: { missingCents: 100, reached: false },
    });
  });

  it('frees a slot at exactly 49.00 of goods and snapshots the waived fee', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 4900, stock: 5 }] });
    const shopper = shopperAt();
    await shopper.addToCart(variants[0]!.id, 1);
    await shopper.pickSlot();
    const res = await shopper.call('post', '/checkout', body());
    const order = await orderByNumber(placedNumber(res));
    expect(order).toMatchObject({
      shippingCents: 0,
      deliveryFeeCents: 299,
      bagFeeCents: 25,
      totalCents: 4925,
    });
  });

  it('charges the peak surcharge for a slot that starts between 17:00 and 20:00', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 2000, stock: 5 }] });
    const shopper = shopperAt();
    await shopper.addToCart(variants[0]!.id, 1);
    await generateSlots(db, new Date());
    const list = await shopper.call('get', '/delivery/slots');
    const slots = bodyOf<{
      data: { days: { slots: { id: string; status: string; startsAt: string }[] }[] };
    }>(list).data.days.flatMap((d) => d.slots);
    const peak = slots.find((s) => s.status === 'open' && isPeakSlot(new Date(s.startsAt)));
    expect(peak, 'an open peak slot in the next days').toBeDefined();
    await shopper.call('put', '/cart/slot', { slotId: peak!.id });
    expect(await cartBill(shopper)).toMatchObject({ deliveryFeeCents: 399 });
    const res = await shopper.call('post', '/checkout', body());
    expect(await orderByNumber(placedNumber(res))).toMatchObject({ shippingCents: 399 });
  });

  it('adds 0.50 for an outer area (Neukölln)', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 2000, stock: 0 }] });
    await stockAt(variants[0]!.id, 'neukoelln', 5);
    const shopper = shopperAt('12045');
    await shopper.addToCart(variants[0]!.id, 1);
    await shopper.pickSlot('12045');
    expect(await cartBill(shopper)).toMatchObject({ deliveryFeeCents: 349 });
    const res = await shopper.call('post', '/checkout', body('12045'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await orderByNumber(placedNumber(res))).toMatchObject({
      shippingCents: 349,
      totalCents: 2000 + 25 + 349,
    });
  });
});

describe('bags', () => {
  it('"No bags, use boxes" is free, remembered on the cart and kept on the order', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 900, stock: 30 }] });
    const shopper = shopperAt();
    await shopper.addToCart(variants[0]!.id, 17); // 3 bags
    expect(await cartBill(shopper)).toMatchObject({ bagCount: 3, bagFeeCents: 75, bags: true });
    const off = await shopper.call('put', '/cart/bags', { bags: false });
    expect(off.status).toBe(200);
    expect(await cartBill(shopper)).toMatchObject({ bagCount: 0, bagFeeCents: 0, bags: false });
    await shopper.pickSlot();
    const res = await shopper.call('post', '/checkout', body());
    expect(await orderByNumber(placedNumber(res))).toMatchObject({ bagFeeCents: 0 });
    expect((await shopper.call('put', '/cart/bags', { bags: 'yes' })).status).toBe(400);
  });
});

describe('the authorisation', () => {
  it('buffers only the weighed goods: deposit, bags and delivery are held exactly', async () => {
    const bananas = await createProduct({
      variants: [
        { priceCents: 189, stock: 40, weight: { pricePerKgCents: 378, nominalGrams: 500 } },
      ],
    });
    const bottles = await createProduct({
      variants: [{ priceCents: 1000, depositCents: 25, stock: 40 }],
    });
    const shopper = shopperAt();
    await shopper.addToCart(bananas.variants[0]!.id, 4); // 7.56 weighed
    await shopper.addToCart(bottles.variants[0]!.id, 1); // 10.00 + 0.25 deposit
    await shopper.pickSlot();
    const res = await shopper.call('post', '/checkout', body());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const order = await orderByNumber(placedNumber(res));
    // goods 17.56, deposit 0.25, one bag 0.25 (5 units), slot 2.99
    expect(order.totalCents).toBe(756 + 1000 + 25 + 25 + 299);
    // 15 % of the weighed 7.56 only (113.4 -> 113), nothing on the 0.25 + 0.25 + 2.99 or the bottle
    expect(order.authorizedCents).toBe(order.totalCents + 113);
  });
});

describe('the final amount keeps the fees and drops the deposit of what was not found', () => {
  const order = { totalCents: 1500 + 75 + 25 + 299, authorizedCents: 1500 + 75 + 25 + 299 };
  const line = {
    lineTotalCents: 1500,
    finalCents: null,
    quantity: 3,
    discountCents: 0,
    depositCents: 25,
    pickedQty: null,
    substitutesItemId: null,
    swapStatus: null,
  };

  it('is the total when everything was found', () => {
    expect(finalAmountCents(order, [line]).amountCents).toBe(order.totalCents);
    expect(finalAmountCents(order, [{ ...line, pickedQty: 3 }]).amountCents).toBe(order.totalCents);
  });

  it('takes back the deposit of the units not found, but not the bag or the delivery', () => {
    // 1 of 3 found: 5.00 of goods and one deposit stay.
    expect(finalAmountCents(order, [{ ...line, pickedQty: 1 }]).amountCents).toBe(
      500 + 25 + 25 + 299,
    );
    // none found: only the bag and the delivery remain.
    expect(finalAmountCents(order, [{ ...line, pickedQty: 0 }]).amountCents).toBe(25 + 299);
  });

  it('never charges a refused replacement or its deposit, and never more than the hold', () => {
    const swap = {
      ...line,
      substitutesItemId: 'orig',
      swapStatus: 'rejected' as const,
      lineTotalCents: 380,
      quantity: 2,
      depositCents: 0,
      pickedQty: null,
    };
    expect(finalAmountCents(order, [{ ...line, pickedQty: 1 }, swap]).amountCents).toBe(
      500 + 25 + 25 + 299,
    );
    // a heavier bag is capped at the authorised amount
    const weighed = { ...line, depositCents: 0, finalCents: 1_000_000 };
    expect(finalAmountCents(order, [weighed])).toMatchObject({
      amountCents: order.authorizedCents,
      capped: true,
    });
  });
});

describe('capture at dispatch', () => {
  it('charges the found units with their deposit, and keeps the bag and the delivery', async () => {
    const { variants } = await createProduct({
      shelfLifeDays: 10,
      variants: [{ priceCents: 500, depositCents: 25, stock: 20 }],
    });
    const buyer = await signedIn(app, 'customer');
    const placed = await placeOrder(app, {
      shopper: buyer.shopper,
      email: buyer.user.email,
      variantId: variants[0]!.id,
      quantity: 3,
    });
    await simulate(app, placed.number);
    const order = await orderByNumber(placed.number);
    // 15.00 + 0.75 deposit + 0.25 bag + 2.99 slot
    expect(order.totalCents).toBe(1500 + 75 + 25 + 299);
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const admin = (await signedIn(app, 'admin')).shopper;
    const short = await admin.call(
      'post',
      `/admin/orders/${placed.number}/items/${line!.id}/shortfall`,
      { pickedQty: 1 },
    );
    expect(short.status, JSON.stringify(short.body)).toBe(200);
    expect((await admin.call('post', `/admin/orders/${placed.number}/pack`)).status).toBe(200);
    expect((await admin.call('post', `/admin/orders/${placed.number}/dispatch`)).status).toBe(200);
    // One of three found: 5.00 + 0.25 deposit, the bag and the delivery stay; two deposits are not charged.
    expect((await orderByNumber(placed.number)).capturedCents).toBe(500 + 25 + 25 + 299);
    expect(stripe.captured.at(-1)?.amountCents).toBe(500 + 25 + 25 + 299);
  });
});

describe('simulate', () => {
  it('a paid order keeps its bill lines', async () => {
    const { variants } = await createProduct({
      variants: [{ priceCents: 800, depositCents: 25, stock: 30 }],
    });
    const shopper = shopperAt();
    await shopper.addToCart(variants[0]!.id, 4);
    await shopper.pickSlot();
    const number = placedNumber(await shopper.call('post', '/checkout', body()));
    expect((await simulate(app, number)).status).toBe(200);
    expect(await orderByNumber(number)).toMatchObject({
      status: 'paid',
      depositCents: 100,
      bagFeeCents: 25,
    });
    const api = await shopper.call('get', `/checkout/orders/${number}`);
    expect(bodyOf<{ data: { totals: object } }>(api).data.totals).toMatchObject({
      depositCents: 100,
      bagFeeCents: 25,
      shippingCents: 299,
      deliveryFeeCents: 299,
    });
  });
});
