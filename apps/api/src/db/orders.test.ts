import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, db } from './client.ts';
import { runMigrations } from './migrate.ts';
import { orderItems, orders, webhookEvents } from './schema/index.ts';

const email = 'order-test@pawsome.test';

const base = {
  email,
  subtotalCents: 2000,
  shippingCents: 490,
  taxCents: 0,
  discountCents: 100,
  totalCents: 2390, // 2000 + 490 + 0 - 100
  shippingMethodCode: 'standard',
  shippingMethodName: 'Standard',
  shippingAddress: {
    fullName: 'Order Tester',
    line1: '1 Test Street',
    city: 'Riga',
    postalCode: 'LV-1000',
    country: 'LV',
  },
};

describe('orders', () => {
  beforeAll(async () => {
    await runMigrations();
    await db.delete(orders).where(eq(orders.email, email));
  });
  afterAll(async () => {
    await db.delete(orders).where(eq(orders.email, email));
    await db.delete(webhookEvents).where(like(webhookEvents.id, 'evt_test_%'));
    await closeDb();
  });

  it('accepts an order whose total equals subtotal + shipping + tax - discount', async () => {
    const [order] = await db.insert(orders).values(base).returning();
    expect(order?.status).toBe('pending_payment');
    expect(order?.number).toMatch(/^PW-\d{4}-\d{6}$/);
  });

  it('rejects an order whose total does not add up', async () => {
    await expect(db.insert(orders).values({ ...base, totalCents: 9999 })).rejects.toThrow();
  });

  it('gives consecutive orders different numbers', async () => {
    const rows = await db.insert(orders).values([base, base]).returning({ number: orders.number });
    expect(new Set(rows.map((r) => r.number)).size).toBe(2);
  });

  it('rejects an order line whose total is not unit price times quantity', async () => {
    const [order] = await db.insert(orders).values(base).returning();
    if (!order) throw new Error('insert returned no row');
    const line = {
      orderId: order.id,
      productName: 'Tug Rope',
      variantName: 'Red · Large',
      sku: 'PW-TEST',
      unitPriceCents: 500,
      quantity: 3,
    };
    await expect(db.insert(orderItems).values({ ...line, lineTotalCents: 1000 })).rejects.toThrow();
    await expect(
      db.insert(orderItems).values({ ...line, lineTotalCents: 1500 }),
    ).resolves.toBeDefined();
  });

  it('treats a repeated webhook event id as a conflict', async () => {
    const event = { id: 'evt_test_1', type: 'payment_intent.succeeded', payload: {} };
    await db.insert(webhookEvents).values(event);
    await expect(db.insert(webhookEvents).values(event)).rejects.toThrow();
  });
});
