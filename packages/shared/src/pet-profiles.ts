import { PET_VALUES, type Pet } from './pets.ts';

// Pure helpers for pet profiles (phase 15): how old a pet is, which "age stage" that is for its
// species, and which product filters a profile turns into. No I/O and `now` is an argument, so a
// unit test can pin every threshold and the same code runs in the API and in the browser (guest
// pets live in localStorage and are never sent to the server).

export const PET_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const;
export type PetSize = (typeof PET_SIZES)[number];

/** A user can keep this many pets; the guest's local list obeys the same limit. */
export const MAX_PETS = 8;

export type AgeStage = 'puppy' | 'kitten' | 'adult' | 'senior';

// One table, one place for the thresholds (in months). A species with no row entry for a stage
// simply has no such stage: a goldfish is never a "puppy", and nobody sells "senior fish food".
//   youngUntil: below this many months the young stage applies (puppy / kitten)
//   seniorFrom: from this many months the senior stage applies
export const AGE_STAGES: Record<
  Pet,
  { young?: { stage: 'puppy' | 'kitten'; until: number }; seniorFrom?: number }
> = {
  dog: { young: { stage: 'puppy', until: 12 }, seniorFrom: 96 },
  cat: { young: { stage: 'kitten', until: 12 }, seniorFrom: 132 },
  bird: {},
  fish: {},
  small: { seniorFrom: 48 },
  reptile: {},
};

export interface PetAgeInput {
  species: Pet;
  /** Plain calendar date `YYYY-MM-DD` (no time zone), or null. */
  birthday?: string | null | undefined;
  approxAgeMonths?: number | null | undefined;
  size?: PetSize | null | undefined;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses `YYYY-MM-DD` into numbers; null when it is not a real calendar date. */
export function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** Today as `YYYY-MM-DD` in UTC (the same date everywhere a test or a server clock says so). */
export function isoToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Whole months between a birthday and `now` (never negative). Null for a bad date. */
export function monthsSince(birthday: string, now: Date): number | null {
  const born = parseIsoDate(birthday);
  if (!born) return null;
  let months = (now.getUTCFullYear() - born.y) * 12 + (now.getUTCMonth() + 1 - born.m);
  // The month is only complete once its day-of-month has been reached.
  if (now.getUTCDate() < born.d) months -= 1;
  return Math.max(0, months);
}

/** Age in months: the birthday wins over the rough age; null when neither is known. */
export function petAgeMonths(pet: PetAgeInput, now: Date): number | null {
  if (pet.birthday) return monthsSince(pet.birthday, now);
  return pet.approxAgeMonths ?? null;
}

/** The species' age stage, or undefined when the age is unknown or the species has no stages. */
export function ageStageFor(species: Pet, ageMonths: number | null): AgeStage | undefined {
  if (ageMonths === null) return undefined;
  const table = AGE_STAGES[species];
  // A species with no stages at all (fish, reptile, bird) has nothing to filter on.
  if (!table.young && table.seniorFrom === undefined) return undefined;
  if (table.young && ageMonths < table.young.until) return table.young.stage;
  if (table.seniorFrom !== undefined && ageMonths >= table.seniorFrom) return 'senior';
  return 'adult';
}

export interface PetFilters {
  /** Product attribute filters, in the shape of the `attr.<key>` URL parameters. */
  attr: { pet: string[]; ageStage?: string[] };
  /** Kept for the gift finder; products carry no size attribute, so it is not a list filter. */
  size?: PetSize;
}

/**
 * What a pet profile means for the product list. `ageStage` always includes `all`, the value
 * products that suit every life stage carry (about two thirds of the catalogue), otherwise
 * "adult dog" would hide most of the dog range.
 */
export function petToFilters(pet: PetAgeInput, now: Date): PetFilters {
  const stage = ageStageFor(pet.species, petAgeMonths(pet, now));
  return {
    attr: { pet: [pet.species], ...(stage && { ageStage: [stage, 'all'] }) },
    ...(pet.size && { size: pet.size }),
  };
}

export const isPetSpecies = (value: string): value is Pet =>
  (PET_VALUES as readonly string[]).includes(value);
