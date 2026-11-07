// The six pet categories as a typed constant. `slug` matches the seeded top-level category slug
// (so `/c/dogs` works), `accent` is the value for `data-pet` (see styles/tokens.css) and `icon`
// picks the glyph in components/icons.
// Phase 5 moves category pages to API data; until then the nav and footer use this list so the
// shell renders without a request. Keep it in sync with apps/api/src/db/seed/categories.ts.
export const PETS = [
  { slug: 'dogs', name: 'Dogs', accent: 'dog', icon: 'dog' },
  { slug: 'cats', name: 'Cats', accent: 'cat', icon: 'cat' },
  { slug: 'birds', name: 'Birds', accent: 'bird', icon: 'bird' },
  { slug: 'fish', name: 'Fish', accent: 'fish', icon: 'fish' },
  { slug: 'small-pets', name: 'Small Pets', accent: 'small-pet', icon: 'rabbit' },
  { slug: 'reptiles', name: 'Reptiles', accent: 'reptile', icon: 'lizard' },
] as const;

export type Pet = (typeof PETS)[number];
export type PetAccent = Pet['accent'];
export type PetIcon = Pet['icon'];

// Product attributes say `pet: 'small'`, but the theme (and the PETS slug) is `small-pet` /
// `small-pets`. One lookup keeps that mismatch out of the components.
const ATTRIBUTE_TO_ACCENT: Record<string, PetAccent> = {
  dog: 'dog',
  cat: 'cat',
  bird: 'bird',
  fish: 'fish',
  small: 'small-pet',
  reptile: 'reptile',
};

export function accentForPetAttribute(pet: string | undefined): PetAccent | undefined {
  return pet ? ATTRIBUTE_TO_ACCENT[pet] : undefined;
}

export function petBySlug(slug: string | undefined): Pet | undefined {
  return PETS.find((p) => p.slug === slug);
}

/** The reverse lookup: a category page's pet accent -> the `attr.pet` value its products carry. */
export function petAttributeForAccent(accent: PetAccent | undefined): string | undefined {
  return Object.entries(ATTRIBUTE_TO_ACCENT).find(([, a]) => a === accent)?.[0];
}
