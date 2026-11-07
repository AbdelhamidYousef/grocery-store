import type { PetProfile } from '@store/shared';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { track } from '../../lib/track';

import { getActivePetId, setActivePetId, subscribeGuestStore } from './guest-store';
import { usePets } from './queries';

interface ActivePetState {
  pets: PetProfile[];
  /** The pet the shopper is buying for, or null for "everyone". */
  activePet: PetProfile | null;
  /** A pet was chosen earlier but the list that holds it has not loaded yet. */
  pending: boolean;
  setActivePet: (pet: PetProfile | null) => void;
}

// No provider (a card in a unit test) means no pet: nothing downstream may require one.
const NONE: ActivePetState = { pets: [], activePet: null, pending: false, setActivePet: () => {} };
const ActivePetContext = createContext<ActivePetState>(NONE);

// "Who are we shopping for" is a per-visitor choice stored in this browser (guest-store.ts); the
// pet itself comes from usePets (server or browser). If the stored id no longer matches a pet
// (deleted on another device) the shopper is simply shopping for everyone.
export function ActivePetProvider({ children }: { children: ReactNode }) {
  const { pets, loading } = usePets();
  const activeId = useSyncExternalStore(subscribeGuestStore, getActivePetId);
  const activePet = pets.find((p) => p.id === activeId) ?? null;

  const setActivePet = useCallback((pet: PetProfile | null) => {
    setActivePetId(pet?.id ?? null);
    track({ name: 'pet_activated', species: pet?.species ?? null });
  }, []);

  const value = useMemo<ActivePetState>(
    () => ({
      pets,
      activePet,
      // Hold the list back only when it matters: someone had picked a pet and we cannot find it yet.
      pending: loading && activeId !== null && activePet === null,
      setActivePet,
    }),
    [pets, activePet, loading, activeId, setActivePet],
  );
  return <ActivePetContext.Provider value={value}>{children}</ActivePetContext.Provider>;
}

export function useActivePet(): ActivePetState {
  return useContext(ActivePetContext);
}
