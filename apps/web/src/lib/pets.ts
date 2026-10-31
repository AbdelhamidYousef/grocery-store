// The five pet categories as a typed constant. `slug` matches the seeded top-level category slug
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
] as const;

export type Pet = (typeof PETS)[number];
export type PetAccent = Pet['accent'];
export type PetIcon = Pet['icon'];
