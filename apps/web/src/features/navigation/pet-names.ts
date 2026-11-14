import type { StringKey, TFunction } from '../../i18n';
import type { Pet } from '../../lib/pets';

// Display names of the six pet categories, keyed by slug. `PETS[].name` stays the English
// source (and the slug the URL); the shell translates the name at render.
const PET_NAME_KEYS: Record<Pet['slug'], StringKey> = {
  dogs: 'shell.pet.dogs',
  cats: 'shell.pet.cats',
  birds: 'shell.pet.birds',
  fish: 'shell.pet.fish',
  'small-pets': 'shell.pet.smallPets',
  reptiles: 'shell.pet.reptiles',
};

export function petName(t: TFunction, pet: Pick<Pet, 'slug'>): string {
  return t(PET_NAME_KEYS[pet.slug]);
}
