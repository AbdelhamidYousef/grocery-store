import { z } from 'zod';

// The ten departments of the shop: the top-level categories (`/c/<slug>`). One constant so the
// API (menu, newsletter interests, seed), the admin validation and the web theme can never
// disagree about which departments exist. `icon` picks the glyph in the web app; the slug is also
// the value of `data-dept`, which selects the department's accent colours in styles/tokens.css.
// The names here are the English source; the shell translates them at render.
export const DEPARTMENTS = [
  { slug: 'fruit-veg', name: 'Fruit & veg', icon: 'apple' },
  { slug: 'bakery', name: 'Bakery', icon: 'bread' },
  { slug: 'dairy-eggs', name: 'Dairy & eggs', icon: 'milk' },
  { slug: 'meat-fish', name: 'Meat & fish', icon: 'fish' },
  { slug: 'pantry', name: 'Pantry', icon: 'jar' },
  { slug: 'frozen', name: 'Frozen', icon: 'snowflake' },
  { slug: 'drinks', name: 'Drinks', icon: 'bottle' },
  { slug: 'snacks-sweets', name: 'Snacks & sweets', icon: 'candy' },
  { slug: 'household', name: 'Household', icon: 'spray' },
  { slug: 'personal-care-baby', name: 'Personal care & baby', icon: 'drop' },
] as const;

export type Department = (typeof DEPARTMENTS)[number];
export type DepartmentSlug = Department['slug'];
export type DepartmentIcon = Department['icon'];

export const DEPARTMENT_SLUGS = DEPARTMENTS.map((d) => d.slug) as unknown as readonly [
  DepartmentSlug,
  ...DepartmentSlug[],
];
export const DepartmentSlugSchema = z.enum(DEPARTMENT_SLUGS);

export function departmentBySlug(slug: string | undefined): Department | undefined {
  return DEPARTMENTS.find((d) => d.slug === slug);
}
