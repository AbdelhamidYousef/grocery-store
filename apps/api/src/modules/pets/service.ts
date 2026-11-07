import {
  MAX_PETS,
  type PetInputSchema,
  type PetProfile,
  type PetUpdateSchema,
} from '@store/shared';
import type { z } from 'zod';

import { db } from '../../db/client.ts';
import { conflict, notFound } from '../../lib/errors.ts';

import * as repo from './repo.ts';

const toPet = (row: repo.PetRow): PetProfile => ({
  id: row.id,
  name: row.name,
  species: row.species,
  birthday: row.birthday,
  approxAgeMonths: row.approxAgeMonths,
  size: row.size,
});

// `undefined` (not sent) and `null` (cleared) differ on a PATCH, but an insert wants null for both.
const toValues = (input: z.output<typeof PetInputSchema>): repo.PetValues => ({
  name: input.name,
  species: input.species,
  birthday: input.birthday ?? null,
  approxAgeMonths: input.approxAgeMonths ?? null,
  size: input.size ?? null,
});

const limitReached = () =>
  conflict('CONFLICT', `You can keep up to ${MAX_PETS} pets. Remove one to add another.`);

export async function listPets(userId: string): Promise<PetProfile[]> {
  return (await repo.listPets(userId)).map(toPet);
}

export async function createPet(
  userId: string,
  input: z.output<typeof PetInputSchema>,
): Promise<PetProfile> {
  return db.transaction(async (tx) => {
    await repo.lockUser(tx, userId);
    if ((await repo.countPets(tx, userId)) >= MAX_PETS) throw limitReached();
    return toPet(await repo.insertPet(tx, userId, toValues(input)));
  });
}

export async function updatePet(
  userId: string,
  id: string,
  input: z.output<typeof PetUpdateSchema>,
): Promise<PetProfile> {
  // Undefined fields are dropped by Drizzle's `set`, which is exactly PATCH semantics.
  const row = await repo.updatePet(userId, id, input);
  if (!row) throw notFound('Pet not found');
  return toPet(row);
}

export async function deletePet(userId: string, id: string): Promise<void> {
  if (!(await repo.deletePet(userId, id))) throw notFound('Pet not found');
}

const keyOf = (name: string, species: string) => `${name.trim().toLowerCase()}:${species}`;

// The guest's local pets arrive once after sign-in. A pet whose name+species the account already
// has (the same pet, merged on a second device) is skipped; the rest are added until the limit.
// Never an error: a merge that cannot add everything still keeps what fits, and the response is
// the account's final list so the browser can drop its local copy.
export async function mergePets(
  userId: string,
  incoming: z.output<typeof PetInputSchema>[],
): Promise<PetProfile[]> {
  return db.transaction(async (tx) => {
    await repo.lockUser(tx, userId);
    const existing = await repo.listPetsTx(tx, userId);
    const seen = new Set(existing.map((p) => keyOf(p.name, p.species)));
    let room = MAX_PETS - existing.length;
    for (const pet of incoming) {
      const key = keyOf(pet.name, pet.species);
      if (seen.has(key) || room <= 0) continue;
      seen.add(key);
      room -= 1;
      await repo.insertPet(tx, userId, toValues(pet));
    }
    return (await repo.listPetsTx(tx, userId))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .map(toPet);
  });
}
