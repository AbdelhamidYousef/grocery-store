import { eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, db } from './client.ts';
import { runMigrations } from './migrate.ts';
import { carts, users } from './schema/index.ts';

const email = 'cart-test@pawsome.test';
const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000);

describe('carts', () => {
  let userId = '';

  beforeAll(async () => {
    await runMigrations();
    await db.delete(users).where(eq(users.email, email));
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash: 'x', firstName: 'Cart', lastName: 'Tester' })
      .returning();
    if (!user) throw new Error('insert returned no row');
    userId = user.id;
  });
  afterAll(async () => {
    await db.delete(users).where(eq(users.email, email)); // cascades to carts
    await closeDb();
  });

  it('rejects a second active cart for the same user', async () => {
    await db.insert(carts).values({ userId, expiresAt });
    await expect(db.insert(carts).values({ userId, expiresAt })).rejects.toThrow();
  });

  it('allows a new active cart once the previous one is no longer active', async () => {
    await db.update(carts).set({ status: 'converted' }).where(eq(carts.userId, userId));
    await expect(db.insert(carts).values({ userId, expiresAt })).resolves.toBeDefined();
  });

  it('allows any number of guest carts', async () => {
    await db.insert(carts).values([{ expiresAt }, { expiresAt }]);
    await db.delete(carts).where(isNull(carts.userId));
  });
});
