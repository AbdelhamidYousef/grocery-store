import { and, asc, count, eq } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import { pets } from '../../db/schema/index.ts';
import { users } from '../../db/schema/users.ts';

export type PetRow = typeof pets.$inferSelect;
export type PetValues = Omit<typeof pets.$inferInsert, 'id' | 'userId'>;

// Every query filters by the pet id AND the owner: the id comes from the URL, the owner from the
// session, so a pet that exists but is someone else's looks exactly like a missing one.

export async function listPets(userId: string): Promise<PetRow[]> {
  return db
    .select()
    .from(pets)
    .where(eq(pets.userId, userId))
    .orderBy(asc(pets.createdAt), asc(pets.id));
}

// Serialises one user's pet writes: the "at most 8" rule is a count-then-insert, which two
// parallel requests could both pass without this lock.
export async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
}

export async function countPets(tx: Tx, userId: string): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(pets).where(eq(pets.userId, userId));
  return row?.n ?? 0;
}

export async function listPetsTx(tx: Tx, userId: string): Promise<PetRow[]> {
  return tx.select().from(pets).where(eq(pets.userId, userId));
}

export async function insertPet(tx: Tx, userId: string, values: PetValues): Promise<PetRow> {
  const [row] = await tx
    .insert(pets)
    .values({ ...values, userId })
    .returning();
  if (!row) throw new Error('insert of a pet returned no row');
  return row;
}

export async function updatePet(
  userId: string,
  id: string,
  values: Partial<PetValues>,
): Promise<PetRow | undefined> {
  const [row] = await db
    .update(pets)
    .set(values)
    .where(and(eq(pets.id, id), eq(pets.userId, userId)))
    .returning();
  return row;
}

export async function deletePet(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(pets)
    .where(and(eq(pets.id, id), eq(pets.userId, userId)))
    .returning({ id: pets.id });
  return rows.length > 0;
}
