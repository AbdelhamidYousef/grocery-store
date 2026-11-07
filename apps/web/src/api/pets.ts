import {
  PetListResponseSchema,
  PetResponseSchema,
  type PetInput,
  type PetProfile,
  type PetUpdateInput,
} from '@store/shared';

import { NoContentSchema } from './auth';
import { apiFetch } from './client';

export async function fetchPets(signal?: AbortSignal): Promise<PetProfile[]> {
  return (
    await apiFetch('/account/pets', { schema: PetListResponseSchema, ...(signal && { signal }) })
  ).data;
}

export async function createPet(input: PetInput): Promise<PetProfile> {
  return (
    await apiFetch('/account/pets', { method: 'POST', body: input, schema: PetResponseSchema })
  ).data;
}

export async function updatePet(id: string, input: PetUpdateInput): Promise<PetProfile> {
  return (
    await apiFetch(`/account/pets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
      schema: PetResponseSchema,
    })
  ).data;
}

export async function deletePet(id: string): Promise<void> {
  await apiFetch(`/account/pets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    schema: NoContentSchema,
  });
}

// The guest's local pets, sent once after sign-in; the answer is the account's final list.
export async function mergePets(pets: PetInput[]): Promise<PetProfile[]> {
  return (
    await apiFetch('/account/pets/merge', {
      method: 'POST',
      body: { pets },
      schema: PetListResponseSchema,
    })
  ).data;
}
