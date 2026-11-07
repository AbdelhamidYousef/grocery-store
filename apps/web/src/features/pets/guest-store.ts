import { MAX_PETS, PetProfileSchema, type PetProfile } from '@store/shared';
import { z } from 'zod';

// A visitor without an account keeps their pets in this browser (localStorage), and the choice of
// "who am I shopping for" lives here too, for guests and signed-in users alike (it is a
// per-visitor preference, not account data). Rules:
//  - every storage access is in try/catch: private mode and blocked storage throw, and the store
//    then simply lives in memory for the visit;
//  - the module keeps the parsed copy and hands out the SAME array until something changes, which
//    is what `useSyncExternalStore` needs to avoid re-rendering in a loop;
//  - nothing here is ever sent to the server except through the explicit merge after sign-in.
const PETS_KEY = 'pawsome.pets';
const ACTIVE_KEY = 'pawsome.activePet';

const ListSchema = z.array(PetProfileSchema).max(MAX_PETS);

let pets: PetProfile[] | undefined;
let active: string | null | undefined;
const listeners = new Set<() => void>();

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Blocked or full: the in-memory copy still serves this visit.
  }
}

const emit = () => listeners.forEach((l) => l());

export function subscribeGuestStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGuestPets(): PetProfile[] {
  if (pets === undefined) {
    const raw = readStorage(PETS_KEY);
    let parsed: PetProfile[] = [];
    if (raw) {
      try {
        const result = ListSchema.safeParse(JSON.parse(raw));
        if (result.success) parsed = result.data;
      } catch {
        // Hand-edited or corrupt: start empty rather than crash the header.
      }
    }
    pets = parsed;
  }
  return pets;
}

export function setGuestPets(next: PetProfile[]): void {
  pets = next;
  writeStorage(PETS_KEY, next.length > 0 ? JSON.stringify(next) : null);
  emit();
}

export function getActivePetId(): string | null {
  if (active === undefined) active = readStorage(ACTIVE_KEY);
  return active;
}

export function setActivePetId(id: string | null): void {
  active = id;
  writeStorage(ACTIVE_KEY, id);
  emit();
}

/** A fresh id for a pet that exists only in this browser; never mistaken for a server uuid. */
export function newLocalPetId(): string {
  return `local-${crypto.randomUUID()}`;
}

/** Tests only: forget the memory copy and the stored values. */
export function resetGuestStore(): void {
  pets = undefined;
  active = undefined;
  writeStorage(PETS_KEY, null);
  writeStorage(ACTIVE_KEY, null);
  emit();
}
