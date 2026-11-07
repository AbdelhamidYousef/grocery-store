import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createProduct } from '../test/factories.ts';

import { db } from './client.ts';
import {
  bulkTiers,
  discountCodes,
  discountRedemptions,
  flashSaleItems,
  flashSales,
  giftRules,
  orderItems,
  orders,
  productVariants,
} from './schema/index.ts';

async function createOrder() {
  const [order] = await db
    .insert(orders)
    .values({
      email: 'a@x.test',
      subtotalCents: 1000,
      shippingCents: 0,
      totalCents: 1000,
      shippingMethodCode: 'standard',
      shippingMethodName: 'Standard',
      shippingAddress: { fullName: 'A', line1: '1', city: 'Riga', postalCode: '1', country: 'LV' },
    })
    .returning();
  if (!order) throw new Error('order insert returned no row');
  return order;
}

async function variantId() {
  const { variants } = await createProduct();
  const id = variants[0]?.id;
  if (!id) throw new Error('factory returned no variant');
  return id;
}

describe('promotions schema', () => {
  it('accepts a percent code of 1..100 and rejects 0 or 101', async () => {
    await db.insert(discountCodes).values({ code: 'OK10', kind: 'percent', value: 10 });
    await expect(
      db.insert(discountCodes).values({ code: 'ZERO', kind: 'percent', value: 0 }),
    ).rejects.toThrow();
    await expect(
      db.insert(discountCodes).values({ code: 'TOOMUCH', kind: 'percent', value: 101 }),
    ).rejects.toThrow();
  });

  it('rejects a fixed code of 0 cents and a free-shipping code with a value', async () => {
    await expect(
      db.insert(discountCodes).values({ code: 'FREE', kind: 'fixed', value: 0 }),
    ).rejects.toThrow();
    await expect(
      db.insert(discountCodes).values({ code: 'SHIP', kind: 'free_shipping', value: 5 }),
    ).rejects.toThrow();
  });

  it('treats codes case-insensitively', async () => {
    await db.insert(discountCodes).values({ code: 'PAWS10', kind: 'percent', value: 10 });
    await expect(
      db.insert(discountCodes).values({ code: 'paws10', kind: 'percent', value: 5 }),
    ).rejects.toThrow();
    const [row] = await db.select().from(discountCodes).where(eq(discountCodes.code, 'Paws10'));
    expect(row?.value).toBe(10);
  });

  it('rejects a code or sale window that ends before it starts', async () => {
    const startsAt = new Date('2026-11-10T00:00:00Z');
    const endsAt = new Date('2026-11-09T00:00:00Z');
    await expect(
      db
        .insert(discountCodes)
        .values({ code: 'BACK', kind: 'fixed', value: 100, startsAt, endsAt }),
    ).rejects.toThrow();
    await expect(
      db.insert(flashSales).values({ name: 'Back', startsAt, endsAt }),
    ).rejects.toThrow();
  });

  it('records a code once per order', async () => {
    const [code] = await db
      .insert(discountCodes)
      .values({ code: 'ONCE', kind: 'fixed', value: 100 })
      .returning();
    const order = await createOrder();
    const row = { codeId: code!.id, orderId: order.id, customerKey: 'a@x.test' };
    await db.insert(discountRedemptions).values(row);
    await expect(db.insert(discountRedemptions).values(row)).rejects.toThrow();
  });

  it('allows only one active gift rule and one tier per threshold', async () => {
    const id = await variantId();
    await db.insert(giftRules).values({ thresholdCents: 4000, variantId: id });
    await expect(
      db.insert(giftRules).values({ thresholdCents: 5000, variantId: id }),
    ).rejects.toThrow();
    await db.insert(giftRules).values({ thresholdCents: 5000, variantId: id, active: false });

    await db.insert(bulkTiers).values({ minCents: 7500, percent: 5 });
    await expect(db.insert(bulkTiers).values({ minCents: 7500, percent: 10 })).rejects.toThrow();
  });

  it('lists a variant once per flash sale', async () => {
    const id = await variantId();
    const [sale] = await db
      .insert(flashSales)
      .values({
        name: 'Weekend',
        startsAt: new Date('2026-11-10T00:00:00Z'),
        endsAt: new Date('2026-11-12T00:00:00Z'),
      })
      .returning();
    await db
      .insert(flashSaleItems)
      .values({ saleId: sale!.id, variantId: id, salePriceCents: 400 });
    await expect(
      db.insert(flashSaleItems).values({ saleId: sale!.id, variantId: id, salePriceCents: 300 }),
    ).rejects.toThrow();
  });

  it('keeps a line discount between 0 and the line total, and a member price above 0', async () => {
    const order = await createOrder();
    const line = {
      orderId: order.id,
      productName: 'Ball',
      variantName: 'Red',
      sku: 'B-1',
      unitPriceCents: 500,
      quantity: 2,
      lineTotalCents: 1000,
    };
    await db.insert(orderItems).values({ ...line, discountCents: 1000 });
    await expect(db.insert(orderItems).values({ ...line, discountCents: 1001 })).rejects.toThrow();

    const id = await variantId();
    await expect(
      db.update(productVariants).set({ memberPriceCents: 0 }).where(eq(productVariants.id, id)),
    ).rejects.toThrow();
  });
});
