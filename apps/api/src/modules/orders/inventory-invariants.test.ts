import { eq, inArray } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { inventory, orderItems, orderStatusHistory, orders } from '../../db/schema/index.ts';
import { releaseStaleReservations } from '../../jobs/release-stale-reservations.ts';
import { AppError } from '../../lib/errors.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf } from '../../test/http.ts';
import { TEST_ADDRESS, simulate } from '../../test/orders.ts';
import { makeShopper, type Shopper } from '../../test/shopper.ts';

import { transitionOrder } from './service.ts';
import { requestableNext } from './state-machine.ts';

// Property-style test: a seeded random sequence of checkouts, payments, cancellations, refunds,
// shipments, dashboard refunds and stale sweeps, some of them concurrent, over a few variants with
// very little stock (so the last unit is contested all the time). After EVERY step the invariants
// below are checked against the database; a failure prints the seed and the step so it can be
// replayed. Fixed seeds keep CI deterministic while still covering many interleavings.
//
// The reconciliation is computed from rows, independently of the code under test:
//   reserved(v) = units of v in orders that are `pending_payment`
//   quantity(v) = initial(v) - units of v in orders that took the units off the shelf and never
//                 got them back: paid / processing / shipped / delivered, plus orders refunded
//                 AFTER shipping (the restock rule says shipped goods are not auto-restocked).

const log = pino({ level: 'silent' });

// Small, fast, seedable PRNG (mulberry32): Math.random cannot be replayed.
function rng(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(xs: T[]): T => xs[Math.floor(next() * xs.length)]!,
  };
}

let fake: FakeStripe;
let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  fake = new FakeStripe();
  app = makeTestApp({ payments: fake });
  await createShippingMethods();
});

async function checkInvariants(variantIds: string[], initial: Map<string, number>, where: string) {
  const stock = await db.select().from(inventory).where(inArray(inventory.variantId, variantIds));
  const lines = await db
    .select({
      variantId: orderItems.variantId,
      quantity: orderItems.quantity,
      status: orders.status,
      orderId: orders.id,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId));
  const shippedOrders = new Set(
    (
      await db
        .select({ orderId: orderStatusHistory.orderId })
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.toStatus, 'shipped'))
    ).map((h) => h.orderId),
  );

  for (const row of stock) {
    const mine = lines.filter((l) => l.variantId === row.variantId);
    const pending = mine
      .filter((l) => l.status === 'pending_payment')
      .reduce((n, l) => n + l.quantity, 0);
    const taken = mine
      .filter(
        (l) =>
          ['paid', 'processing', 'shipped', 'delivered'].includes(l.status) ||
          (l.status === 'refunded' && shippedOrders.has(l.orderId)),
      )
      .reduce((n, l) => n + l.quantity, 0);

    const ctx = `${where}, variant ${row.variantId.slice(0, 8)}`;
    expect(row.quantity, `quantity never negative (${ctx})`).toBeGreaterThanOrEqual(0);
    expect(row.reserved, `reserved never negative (${ctx})`).toBeGreaterThanOrEqual(0);
    expect(row.reserved, `reserved <= quantity (${ctx})`).toBeLessThanOrEqual(row.quantity);
    expect(row.reserved, `reserved equals pending orders' units (${ctx})`).toBe(pending);
    expect(row.quantity, `quantity reconciles with orders (${ctx})`).toBe(
      initial.get(row.variantId)! - taken,
    );
  }
}

async function run(seed: number, steps: number) {
  const random = rng(seed);
  const stock = [4, 6, 3];
  const { variants } = await createProduct({
    variants: stock.map((s, i) => ({ stock: s, options: { v: String(i) } })),
  });
  const variantIds = variants.map((v) => v.id);
  const initial = new Map(variantIds.map((id, i) => [id, stock[i]!]));
  const shoppers: { shopper: Shopper; number: string | null }[] = [];

  const known = async () => db.select().from(orders);

  // Each action tolerates the business refusals a real shopper or admin would get (409 conflicts,
  // 400 validation), and nothing else: a 500 or a thrown database error fails the test.
  const tolerate = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      if (err instanceof AppError && [400, 404, 409].includes(err.status)) return;
      throw err;
    }
  };

  const actions: Record<string, () => Promise<unknown>> = {
    checkout: async () => {
      // Half the time a returning shopper presses "pay" again (re-checkout of a pending order).
      const again = shoppers.length > 0 && random.next() < 0.3;
      const entry = again ? random.pick(shoppers) : { shopper: makeShopper(app), number: null };
      if (!again) shoppers.push(entry);
      for (let i = random.int(3) + 1; i > 0; i--) {
        await entry.shopper.addToCart(random.pick(variantIds), random.int(3) + 1);
      }
      const res = await entry.shopper.call('post', '/checkout', {
        email: 'ada@pawsome.test',
        shippingAddress: TEST_ADDRESS,
        shippingMethodCode: 'standard',
      });
      expect([200, 409, 400], `checkout answered ${res.status}`).toContain(res.status);
      if (res.status === 200) {
        entry.number = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
      }
    },
    pay: async () => {
      const pending = (await known()).filter((o) => o.status === 'pending_payment');
      if (pending.length === 0) return;
      const res = await simulate(app, random.pick(pending).number);
      expect(res.status).toBeLessThan(500);
    },
    cancelIntent: async () => {
      const pending = (await known()).filter((o) => o.status === 'pending_payment');
      if (pending.length === 0) return;
      const res = await simulate(app, random.pick(pending).number, 'payment_intent.canceled');
      expect(res.status).toBeLessThan(500);
    },
    dashboardRefund: async () => {
      const all = await known();
      if (all.length === 0) return;
      const res = await simulate(app, random.pick(all).number, 'charge.refunded');
      expect(res.status).toBeLessThan(500);
    },
    adminMove: async () => {
      const movable = (await known()).filter((o) => requestableNext(o.status).length > 0);
      if (movable.length === 0) return;
      const order = random.pick(movable);
      await tolerate(() =>
        transitionOrder(
          { gateway: fake, log },
          order.number,
          random.pick([...requestableNext(order.status)]),
          {
            actor: 'admin:test@pawsome.test',
          },
        ),
      );
    },
    sweep: () => releaseStaleReservations({ gateway: fake, log, olderThanMs: 0 }),
  };
  // Weighted: checkouts and payments dominate, as in a real shop.
  const menu = [
    'checkout',
    'checkout',
    'checkout',
    'pay',
    'pay',
    'adminMove',
    'adminMove',
    'cancelIntent',
    'dashboardRefund',
    'sweep',
  ] as const;

  for (let step = 1; step <= steps; step++) {
    const picked = [random.pick([...menu])];
    // A third of the steps race two actions against each other.
    if (random.next() < 0.33) picked.push(random.pick([...menu]));
    await Promise.all(picked.map((name) => tolerate(actions[name]!)));
    await checkInvariants(
      variantIds,
      initial,
      `seed ${seed}, step ${step} (${picked.join(' + ')})`,
    );
  }

  // End state: finish every open order, then everything must still reconcile with nothing held.
  for (const o of (await known()).filter((x) => x.status === 'pending_payment')) {
    await tolerate(() =>
      transitionOrder({ gateway: fake, log }, o.number, 'cancelled', {
        actor: 'admin:test@pawsome.test',
      }),
    );
  }
  await checkInvariants(variantIds, initial, `seed ${seed}, end`);
  const left = await db.select().from(inventory).where(inArray(inventory.variantId, variantIds));
  expect(left.every((r) => r.reserved === 0)).toBe(true);
}

describe('inventory invariants under random checkouts, payments and cancellations', () => {
  it.each([1, 2, 3, 4, 5, 6])(
    'keeps stock consistent for seed %i',
    async (seed) => {
      await run(seed, 45);
    },
    120_000,
  );
});
