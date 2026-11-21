import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../../db/client.ts';
import { orders } from '../../../db/schema/index.ts';
import { makeTestApp } from '../../../test/app.ts';
import { createProduct, createShippingMethods } from '../../../test/factories.ts';
import { FakeStripe } from '../../../test/fake-stripe.ts';
import { bodyOf } from '../../../test/http.ts';
import { orderByNumber, placeOrder, signedIn, simulate } from '../../../test/orders.ts';
import { transitionOrder } from '../../orders/service.ts';

import { getStats } from './service.ts';

const fake = new FakeStripe();
const app = makeTestApp({ payments: fake });
beforeEach(async () => {
  await createShippingMethods();
});

describe('admin stats', () => {
  it("counts today's placed orders and 30-day revenue, excluding cancelled and refunded ones", async () => {
    // Goods + one bag (0.25) + a slot (2.99): 15.00 -> 1824, 20.00 -> 2324.
    const a = await placeOrder(app, { priceCents: 1500, quantity: 1 });
    const b = await placeOrder(app, { priceCents: 2000, quantity: 1 });
    const c = await placeOrder(app, { priceCents: 3000, quantity: 1 }); // refunded below
    const pendingOnly = await placeOrder(app); // never paid: not an order yet
    for (const o of [a, b, c]) await simulate(app, o.number);
    await transitionOrder({ gateway: fake, log: pino({ level: 'silent' }) }, c.number, 'refunded', {
      actor: 'admin:x@y.z',
    });
    void pendingOnly;

    const admin = await signedIn(app, 'admin');
    const res = await admin.shopper.call('get', '/admin/stats');
    const { data } = bodyOf<{ data: Record<string, unknown> }>(res);
    // Today's count includes the refunded one (it was placed today); revenue does not.
    expect(data).toMatchObject({ ordersToday: 3, revenue30dCents: 1824 + 2324, currency: 'EUR' });
  });

  it('ignores orders placed before the windows', async () => {
    const a = await placeOrder(app, { priceCents: 1000, quantity: 1 });
    await simulate(app, a.number);
    const order = await orderByNumber(a.number);
    const now = new Date();
    await db
      .update(orders)
      .set({ placedAt: new Date(now.getTime() - 40 * 24 * 3600 * 1000) })
      .where(eq(orders.id, order.id));
    expect(await getStats(now)).toMatchObject({ ordersToday: 0, revenue30dCents: 0 });
  });

  it('counts low stock on available units of active variants only', async () => {
    await createProduct({ variants: [{ stock: 3, lowStockThreshold: 5 }] }); // low
    await createProduct({ variants: [{ stock: 50, lowStockThreshold: 5 }] }); // fine
    await createProduct({ variants: [{ stock: 6, reserved: 3, lowStockThreshold: 5 }] }); // 3 available: low
    await createProduct({ status: 'archived', variants: [{ stock: 0 }] }); // not on sale
    await createProduct({ variants: [{ stock: 0, status: 'archived' }] }); // variant retired
    expect((await getStats()).lowStockCount).toBe(2);
  });
});
