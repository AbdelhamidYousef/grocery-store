import { petAgeMonths, type PetProfile } from '@store/shared';

import type { StringKey, TFunction, TnFunction } from '../../i18n';

const SPECIES_LABEL: Record<string, string> = {
  dog: 'Dog',
  cat: 'Cat',
  bird: 'Bird',
  fish: 'Fish',
  small: 'Small pet',
  reptile: 'Reptile',
};

export const speciesLabel = (species: string): string => SPECIES_LABEL[species] ?? species;

const SPECIES_KEY: Record<string, StringKey> = {
  dog: 'pets.species.dog',
  cat: 'pets.species.cat',
  bird: 'pets.species.bird',
  fish: 'pets.species.fish',
  small: 'pets.species.small',
  reptile: 'pets.species.reptile',
};

/** The species in the shopper's language (`speciesLabel` stays the English one, for admin). */
export const speciesName = (t: TFunction, species: string): string => {
  const key = SPECIES_KEY[species];
  return key ? t(key) : species;
};

/** "2 years 3 months", "5 months", or null when the age is unknown. */
export function describeAge(pet: PetProfile, now: Date, tn: TnFunction): string | null {
  const months = petAgeMonths(pet, now);
  if (months === null) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years > 0 ? tn('pets.age.years', years) : '';
  const m = rest > 0 || years === 0 ? tn('pets.age.months', rest) : '';
  return [y, m].filter(Boolean).join(' ');
}
