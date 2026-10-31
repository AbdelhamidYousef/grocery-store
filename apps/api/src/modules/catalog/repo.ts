import { count, eq, or, sql } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { categories, products } from '../../db/schema/index.ts';

export type CategoryRow = typeof categories.$inferSelect & { productCount: number };

// Active products per category, as a subquery joined once: counts for the whole tree cost one
// query instead of one per category.
function withCounts() {
  const counts = db
    .select({ categoryId: products.categoryId, n: count().as('n') })
    .from(products)
    .where(eq(products.status, 'active'))
    .groupBy(products.categoryId)
    .as('product_counts');
  return db
    .select({
      category: categories,
      // coalesce: a category with no products has no row in the subquery.
      productCount: sql<number>`coalesce(${counts.n}, 0)::int`,
    })
    .from(categories)
    .leftJoin(counts, eq(counts.categoryId, categories.id));
}

function flatten(rows: { category: typeof categories.$inferSelect; productCount: number }[]) {
  return rows.map((r): CategoryRow => ({ ...r.category, productCount: r.productCount }));
}

export async function listCategories(): Promise<CategoryRow[]> {
  return flatten(await withCounts().orderBy(categories.sortOrder, categories.name));
}

// The category and its direct children in one round trip (the tree is one level deep).
export async function getCategoryBySlug(slug: string): Promise<CategoryRow[]> {
  const parent = db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  return flatten(
    await withCounts()
      .where(or(eq(categories.slug, slug), eq(categories.parentId, sql`(${parent})`)))
      .orderBy(categories.sortOrder, categories.name),
  );
}
