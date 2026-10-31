import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createCart, createUser } from '../test/factories.ts';

import { db } from './client.ts';
import { carts } from './schema/index.ts';

describe('carts', () => {
  it('rejects a second active cart for the same user', async () => {
    const user = await createUser();
    await createCart({ userId: user.id });
    await expect(createCart({ userId: user.id })).rejects.toThrow();
  });

  it('allows a new active cart once the previous one is no longer active', async () => {
    const user = await createUser();
    await createCart({ userId: user.id });
    await db.update(carts).set({ status: 'converted' }).where(eq(carts.userId, user.id));
    await expect(createCart({ userId: user.id })).resolves.toBeDefined();
  });

  it('allows any number of guest carts', async () => {
    await createCart();
    await expect(createCart()).resolves.toBeDefined();
  });
});
