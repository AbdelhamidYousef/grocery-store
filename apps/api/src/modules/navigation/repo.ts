import type { Pet } from '@store/shared';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { brands, menuPromos, products } from '../../db/schema/index.ts';
import { variantSummary } from '../catalog/repo.ts';

export type MenuPromoRow = typeof menuPromos.$inferSelect;
export type MenuPromoValues = Omit<typeof menuPromos.$inferInsert, 'id'>;

// Brands that sell something buyable for each pet, biggest first, in one grouped query for all
// pets (the menu needs six lists; six queries would be six round trips on a cache miss).
export async function brandsByPet(): Promise<
  { pet: Pet; slug: string; name: string; n: number }[]
> {
  const v = variantSummary();
  const pet = sql<Pet>`${products.attributes}->>'pet'`;
  const rows = await db
    .select({ pet, slug: brands.slug, name: brands.name, n: count() })
    .from(products)
    .innerJoin(v, eq(v.productId, products.id))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(and(eq(products.status, 'active'), sql`${products.attributes} ? 'pet'`))
    .groupBy(pet, brands.slug, brands.name)
    .orderBy(desc(count()), asc(brands.name));
  return rows;
}

// Public side: active promos in the editor's order.
export async function listActivePromos(): Promise<MenuPromoRow[]> {
  return db
    .select()
    .from(menuPromos)
    .where(eq(menuPromos.active, true))
    .orderBy(asc(menuPromos.sortOrder), asc(menuPromos.createdAt), asc(menuPromos.id));
}

export async function listPromos(): Promise<MenuPromoRow[]> {
  return db
    .select()
    .from(menuPromos)
    .orderBy(asc(menuPromos.sortOrder), asc(menuPromos.createdAt), asc(menuPromos.id));
}

export async function nextSortOrder(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${menuPromos.sortOrder})` })
    .from(menuPromos);
  return (row?.max ?? -1) + 1;
}

export async function insertPromo(values: MenuPromoValues): Promise<MenuPromoRow> {
  const [row] = await db.insert(menuPromos).values(values).returning();
  if (!row) throw new Error('insert of a menu promo returned no row');
  return row;
}

export async function updatePromo(
  id: string,
  values: Partial<MenuPromoValues>,
): Promise<MenuPromoRow | undefined> {
  const [row] = await db.update(menuPromos).set(values).where(eq(menuPromos.id, id)).returning();
  return row;
}

export async function deletePromo(id: string): Promise<boolean> {
  const rows = await db
    .delete(menuPromos)
    .where(eq(menuPromos.id, id))
    .returning({ id: menuPromos.id });
  return rows.length > 0;
}
