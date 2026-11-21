import { asc, count, desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { brands, categories, menuPromos, products } from '../../db/schema/index.ts';
import { variantSummary } from '../catalog/repo.ts';

export type MenuPromoRow = typeof menuPromos.$inferSelect;
export type MenuPromoValues = Omit<typeof menuPromos.$inferInsert, 'id'>;

// Brands that sell something buyable in each department, biggest first, in one grouped query for
// all departments (the menu needs ten lists; ten queries would be ten round trips on a cache
// miss). A product counts for the top-level category of its own category: a subcategory's parent,
// or the category itself when it is already top-level.
export async function brandsByDepartment(): Promise<
  { department: string; slug: string; name: string; n: number }[]
> {
  const v = variantSummary();
  const department = sql<string>`coalesce(parent.slug, ${categories.slug})`;
  const rows = await db
    .select({ department, slug: brands.slug, name: brands.name, n: count() })
    .from(products)
    .innerJoin(v, eq(v.productId, products.id))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(sql`categories parent`, sql`parent.id = ${categories.parentId}`)
    .where(eq(products.status, 'active'))
    .groupBy(department, brands.slug, brands.name)
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

// A promo belongs to a department: a top-level category (no parent).
export async function departmentExists(categoryId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(sql`${categories.id} = ${categoryId} and ${categories.parentId} is null`);
  return row !== undefined;
}
