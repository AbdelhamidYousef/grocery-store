import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from './client.ts';
import { addresses, sessions, users } from './schema/index.ts';

const email = 'db-smoke@pawsome.test';

async function insertUser() {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: 'x', firstName: 'Test', lastName: 'User' })
    .returning();
  if (!user) throw new Error('insert returned no row');
  return user;
}

describe('users, sessions and addresses', () => {
  it('treats emails as case-insensitive and unique', async () => {
    const user = await insertUser();
    expect(user.role).toBe('customer');
    await expect(
      db.insert(users).values({
        email: email.toUpperCase(),
        passwordHash: 'x',
        firstName: 'Dup',
        lastName: 'User',
      }),
    ).rejects.toThrow();
  });

  it('cascades deletes from a user to their sessions and addresses', async () => {
    const user = await insertUser();
    await db.insert(sessions).values({
      id: 'session-token-for-test',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(addresses).values({
      userId: user.id,
      fullName: 'Test User',
      line1: '1 Test Street',
      city: 'Riga',
      postalCode: 'LV-1000',
      country: 'LV',
    });

    await db.delete(users).where(eq(users.id, user.id));

    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    expect(await db.select().from(addresses).where(eq(addresses.userId, user.id))).toHaveLength(0);
  });

  it('allows only one default shipping address per user', async () => {
    const user = await insertUser();
    const base = {
      userId: user.id,
      fullName: 'Test User',
      line1: '1 Test Street',
      city: 'Riga',
      postalCode: 'LV-1000',
      country: 'LV',
    };
    await db.insert(addresses).values({ ...base, isDefaultShipping: true });
    // Non-default addresses are unlimited...
    await db.insert(addresses).values([base, base]);
    // ...but a second default is rejected by the partial unique index.
    await expect(
      db.insert(addresses).values({ ...base, isDefaultShipping: true }),
    ).rejects.toThrow();
  });
});
