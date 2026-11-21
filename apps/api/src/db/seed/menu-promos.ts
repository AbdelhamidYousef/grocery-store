import { count, inArray } from 'drizzle-orm';

import type { Tx } from '../client.ts';
import { categories, menuPromos } from '../schema/index.ts';

// The featured tile of each mega-menu panel. Pictures are the department placeholders until the
// owner swaps in promo art; an admin can change every field. `department: null` is the fallback
// for a panel with no promo of its own.
export const MENU_PROMO_SEEDS = [
  {
    department: 'fruit-veg',
    title: 'Fresh this week',
    subtitle: 'Berries, tomatoes and herbs, picked for the weekend.',
    imageUrl: '/products/placeholders/fruit-veg.svg',
    imageAlt: 'An apple, drawn as a simple icon',
    link: '/c/fruit-veg',
  },
  {
    department: 'bakery',
    title: 'Baked this morning',
    subtitle: 'Rolls, loaves and croissants from Ofenfrisch.',
    imageUrl: '/products/placeholders/bakery.svg',
    imageAlt: 'A loaf of bread, drawn as a simple icon',
    link: '/c/bakery',
  },
  {
    department: 'dairy-eggs',
    title: 'From farms near Berlin',
    subtitle: 'Milk, yoghurt, cheese and eggs from Meadowbrook.',
    imageUrl: '/products/placeholders/dairy-eggs.svg',
    imageAlt: 'A milk bottle, drawn as a simple icon',
    link: '/brands/meadowbrook',
  },
  {
    department: 'frozen',
    title: 'Dinner in ten minutes',
    subtitle: 'Pizza, fish fingers and fries from the freezer.',
    imageUrl: '/products/placeholders/frozen.svg',
    imageAlt: 'A snowflake, drawn as a simple icon',
    link: '/c/frozen-meals',
  },
  {
    department: 'household',
    title: 'Cleaning day',
    subtitle: 'Everything for a fresh home, in one order.',
    imageUrl: '/products/placeholders/household.svg',
    imageAlt: 'A spray bottle, drawn as a simple icon',
    link: '/c/cleaning',
  },
  {
    department: null,
    title: 'At your door in 30 minutes',
    subtitle: 'Order before 21:00 and we bring it today.',
    imageUrl: '/products/placeholders/pantry.svg',
    imageAlt: 'A jar, drawn as a simple icon',
    link: '/help',
  },
] as const;

// Seeded only into an empty table: promos an admin has edited, reordered or deleted are theirs,
// and re-seeding must not bring a deleted one back.
export async function seedMenuPromos(tx: Tx): Promise<void> {
  const [row] = await tx.select({ n: count() }).from(menuPromos);
  if ((row?.n ?? 0) > 0) return;
  const slugs = MENU_PROMO_SEEDS.flatMap((p) => (p.department ? [p.department] : []));
  const rows = await tx
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(inArray(categories.slug, slugs));
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
  await tx.insert(menuPromos).values(
    MENU_PROMO_SEEDS.map(({ department, ...promo }, i) => {
      const categoryId = department ? idBySlug.get(department) : null;
      if (department && !categoryId)
        throw new Error(`menu promo: unknown department ${department}`);
      return { ...promo, categoryId: categoryId ?? null, sortOrder: i, active: true };
    }),
  );
}
