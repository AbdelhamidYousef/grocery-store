import { petAgeMonths, type PetProfile } from '@store/shared';

const SPECIES_LABEL: Record<string, string> = {
  dog: 'Dog',
  cat: 'Cat',
  bird: 'Bird',
  fish: 'Fish',
  small: 'Small pet',
  reptile: 'Reptile',
};

export const speciesLabel = (species: string): string => SPECIES_LABEL[species] ?? species;

/** "2 years 3 months", "5 months", or null when the age is unknown. */
export function describeAge(pet: PetProfile, now: Date): string | null {
  const months = petAgeMonths(pet, now);
  if (months === null) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years > 0 ? `${years} ${years === 1 ? 'year' : 'years'}` : '';
  const m = rest > 0 || years === 0 ? `${rest} ${rest === 1 ? 'month' : 'months'}` : '';
  return [y, m].filter(Boolean).join(' ');
}
