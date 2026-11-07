import {
  MAX_PETS,
  PetInputSchema,
  type PetInput,
  type PetProfile,
  type PetUpdateInput,
} from '@store/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

import { createPet, deletePet, fetchPets, mergePets, updatePet } from '../../api/pets';
import { keys } from '../../lib/query-client';
import { track } from '../../lib/track';
import { useAuth } from '../auth/AuthProvider';

import {
  getActivePetId,
  getGuestPets,
  newLocalPetId,
  setActivePetId,
  setGuestPets,
  subscribeGuestStore,
} from './guest-store';

export interface PetsApi {
  pets: PetProfile[];
  /** True while the list is still being loaded (signed in, first fetch). */
  loading: boolean;
  /** True when the pets are the account's (server), false when they live in this browser. */
  synced: boolean;
  atLimit: boolean;
  add: (input: PetInput) => Promise<PetProfile>;
  update: (id: string, input: PetUpdateInput) => Promise<PetProfile>;
  remove: (id: string) => Promise<void>;
}

// One hook for both worlds: a signed-in user's pets come from the API, a guest's from
// localStorage. Components never ask which, which is what keeps the account page, the header
// switcher and the shop filters identical for both.
export function usePets(): PetsApi {
  const { user, status } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = user !== null;
  const server = useQuery({
    queryKey: keys.account.pets,
    queryFn: ({ signal }) => fetchPets(signal),
    enabled: signedIn,
  });
  const local = useSyncExternalStore(subscribeGuestStore, getGuestPets);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.account.pets });
  const create = useMutation({ mutationFn: createPet, onSuccess: invalidate });
  const patch = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PetUpdateInput }) => updatePet(id, input),
    onSuccess: invalidate,
  });
  const destroy = useMutation({ mutationFn: deletePet, onSuccess: invalidate });

  const pets = signedIn ? (server.data ?? []) : local;

  const add = useCallback(
    async (input: PetInput): Promise<PetProfile> => {
      let created: PetProfile;
      if (signedIn) {
        created = await create.mutateAsync(input);
      } else {
        if (getGuestPets().length >= MAX_PETS)
          throw new Error(`You can keep up to ${MAX_PETS} pets.`);
        const parsed = PetInputSchema.parse(input);
        created = {
          id: newLocalPetId(),
          name: parsed.name,
          species: parsed.species,
          birthday: parsed.birthday ?? null,
          approxAgeMonths: parsed.approxAgeMonths ?? null,
          size: parsed.size ?? null,
        };
        setGuestPets([...getGuestPets(), created]);
      }
      track({ name: 'pet_added', species: created.species });
      return created;
    },
    [signedIn, create],
  );

  const update = useCallback(
    async (id: string, input: PetUpdateInput): Promise<PetProfile> => {
      if (signedIn) return patch.mutateAsync({ id, input });
      const current = getGuestPets().find((p) => p.id === id);
      if (!current) throw new Error('Pet not found');
      const parsed = PetInputSchema.partial().parse(input);
      const next: PetProfile = {
        ...current,
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.species !== undefined && { species: parsed.species }),
        ...(parsed.birthday !== undefined && { birthday: parsed.birthday }),
        ...(parsed.approxAgeMonths !== undefined && { approxAgeMonths: parsed.approxAgeMonths }),
        ...(parsed.size !== undefined && { size: parsed.size }),
      };
      setGuestPets(getGuestPets().map((p) => (p.id === id ? next : p)));
      return next;
    },
    [signedIn, patch],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (signedIn) await destroy.mutateAsync(id);
      else setGuestPets(getGuestPets().filter((p) => p.id !== id));
      // A removed pet cannot stay the one we shop for.
      if (getActivePetId() === id) setActivePetId(null);
    },
    [signedIn, destroy],
  );

  return {
    pets,
    // Until the session question is answered we do not know which list is the right one.
    loading: status === 'loading' || (signedIn && server.isPending),
    synced: signedIn,
    atLimit: pets.length >= MAX_PETS,
    add,
    update,
    remove,
  };
}

const keyOf = (name: string, species: string) => `${name.trim().toLowerCase()}:${species}`;

// After sign-in: send the browser's pets to the account once. The server skips duplicates
// (name + species) and answers with the final list. On any failure the local copy stays, so the
// next sign-in simply tries again, and nothing the visitor typed is lost. The active choice is a
// local id, which no longer exists after the merge, so it is re-pointed at the same-named pet.
export async function mergeGuestPets(queryClient: QueryClient): Promise<void> {
  const local = getGuestPets();
  if (local.length === 0) return;
  const activeLocal = local.find((p) => p.id === getActivePetId());
  try {
    const merged = await mergePets(
      local.map(({ name, species, birthday, approxAgeMonths, size }) => ({
        name,
        species,
        birthday,
        approxAgeMonths,
        size,
      })),
    );
    setGuestPets([]);
    if (activeLocal) {
      const same = merged.find(
        (p) => keyOf(p.name, p.species) === keyOf(activeLocal.name, activeLocal.species),
      );
      setActivePetId(same?.id ?? null);
    }
    await queryClient.invalidateQueries({ queryKey: keys.account.pets });
  } catch {
    // Keep the local pets for the next try.
  }
}
