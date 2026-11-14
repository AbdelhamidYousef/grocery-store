const SPECIES_LABEL: Record<string, string> = {
  dog: 'Dog',
  cat: 'Cat',
  bird: 'Bird',
  fish: 'Fish',
  small: 'Small pet',
  reptile: 'Reptile',
};

// The English species name, for the admin's menu-promo screens.
export const speciesLabel = (species: string): string => SPECIES_LABEL[species] ?? species;
