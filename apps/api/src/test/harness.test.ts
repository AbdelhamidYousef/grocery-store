import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../db/client.ts';

import { createCart, createProduct, createUser } from './factories.ts';

const countUsers = async () => {
  const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from users`);
  return rows[0]?.n;
};

describe('test harness', () => {
  it('starts every test with an empty database (part 1: write)', async () => {
    await createUser();
    expect(await countUsers()).toBe(1);
  });

  it('starts every test with an empty database (part 2: nothing left over)', async () => {
    expect(await countUsers()).toBe(0);
  });

  it('builds a product with variants, stock and a cart that references them', async () => {
    const user = await createUser();
    const { variants } = await createProduct({
      variants: [{ priceCents: 500, stock: 3 }, { priceCents: 900 }],
    });
    const first = variants[0];
    if (!first) throw new Error('no variant');

    const { cart, items } = await createCart({
      userId: user.id,
      items: [{ variantId: first.id, quantity: 2 }],
    });

    expect(variants).toHaveLength(2);
    expect(cart.userId).toBe(user.id);
    expect(items).toHaveLength(1);
  });

  it('lets factories be called repeatedly without unique-constraint clashes', async () => {
    await createUser();
    await createUser();
    await createProduct();
    await createProduct();
    expect(await countUsers()).toBe(2);
  });
});
