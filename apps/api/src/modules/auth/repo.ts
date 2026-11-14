import { eq } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { users } from '../../db/schema/index.ts';
import { currentStore } from '../i18n/context.ts';

export type UserRow = typeof users.$inferSelect;

// These two return the full row including `passwordHash`: they exist for credential checks only,
// and the service maps to the public shape before anything leaves the module.
export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  // `email` is citext, so the comparison is case-insensitive.
  const [row] = await db.select().from(users).where(eq(users.email, email));
  return row;
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

// `ON CONFLICT DO NOTHING` makes "email already taken" one atomic statement: two simultaneous
// registrations cannot both pass a separate existence check and then crash on the unique index.
// Returns undefined when the email exists.
export async function insertUser(values: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
}): Promise<UserRow | undefined> {
  const [row] = await db
    .insert(users)
    .values({ ...values, storeView: currentStore().code })
    .onConflictDoNothing()
    .returning();
  return row;
}
