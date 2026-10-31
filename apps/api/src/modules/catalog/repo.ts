import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import {
  categories,
  inventory,
  productImages,
  productVariants,
  products,
} from '../../db/schema/index.ts';
import type { ProductAttributes } from '../../db/schema/products.ts';

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

// ---------- product list ----------

export type SortKey = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'name';

export interface ProductListParams {
  sort: SortKey;
  limit: number;
  offset: number;
}

// Per-product facts about its *active* variants, computed once and joined: cheapest and dearest
// price for the "from" line, and whether any variant has stock left. Products with no active
// variant have no row here, so an inner join also hides products nobody could buy.
function variantSummary() {
  return db
    .select({
      productId: productVariants.productId,
      minCents: sql<number>`min(${productVariants.priceCents})`.as('min_cents'),
      maxCents: sql<number>`max(${productVariants.priceCents})`.as('max_cents'),
      currency: sql<string>`min(${productVariants.currency})`.as('currency'),
      inStock:
        sql<boolean>`coalesce(bool_or(${inventory.quantity} - ${inventory.reserved} > 0), false)`.as(
          'in_stock',
        ),
    })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(productVariants.status, 'active'))
    .groupBy(productVariants.productId)
    .as('variant_summary');
}

export interface ProductCardRow {
  id: string;
  slug: string;
  name: string;
  attributes: ProductAttributes;
  categorySlug: string;
  minCents: number;
  maxCents: number;
  currency: string;
  inStock: boolean;
}

export interface ProductImageRow {
  id: string;
  productId: string;
  variantId: string | null;
  url: string;
  alt: string;
  width: number;
  height: number;
}

// Every ordering ends in `products.id`: without a unique last key, rows that tie on the sort
// column may swap places between pages and a shopper would see duplicates or gaps.
function orderBy(sort: SortKey, v: ReturnType<typeof variantSummary>): SQL[] {
  switch (sort) {
    case 'price_asc':
      return [asc(v.minCents), asc(products.id)];
    case 'price_desc':
      return [desc(v.minCents), asc(products.id)];
    case 'name':
      return [asc(sql`lower(${products.name})`), asc(products.id)];
    case 'relevance': // becomes ts_rank in step 3.5; until then the newest-first order
    case 'newest':
      return [desc(products.createdAt), asc(products.id)];
  }
}

export async function listProducts(
  params: ProductListParams,
): Promise<{ rows: ProductCardRow[]; total: number }> {
  const v = variantSummary();
  const where = and(eq(products.status, 'active'));

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      attributes: products.attributes,
      categorySlug: categories.slug,
      minCents: v.minCents,
      maxCents: v.maxCents,
      currency: v.currency,
      inStock: v.inStock,
    })
    .from(products)
    .innerJoin(v, eq(v.productId, products.id))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(where)
    .orderBy(...orderBy(params.sort, v))
    .limit(params.limit)
    .offset(params.offset);

  const [totalRow] = await db
    .select({ total: count() })
    .from(products)
    .innerJoin(v, eq(v.productId, products.id))
    .where(where);

  return { rows, total: totalRow?.total ?? 0 };
}

// One image per product for the cards: product-level images before variant-specific ones, then
// the editor's sort order. DISTINCT ON keeps the first row of each product's ordering.
export async function listPrimaryImages(productIds: string[]): Promise<ProductImageRow[]> {
  if (productIds.length === 0) return [];
  return db
    .selectDistinctOn([productImages.productId], {
      id: productImages.id,
      productId: productImages.productId,
      variantId: productImages.variantId,
      url: productImages.url,
      alt: productImages.alt,
      width: productImages.width,
      height: productImages.height,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(
      productImages.productId,
      sql`${productImages.variantId} is not null`,
      productImages.sortOrder,
      productImages.id,
    );
}
