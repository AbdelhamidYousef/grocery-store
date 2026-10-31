import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

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

export interface ProductFilters {
  /** Free-text search term, already trimmed (1-100 characters). */
  q?: string;
  /** Category slug; its child categories are included. */
  category?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  inStock?: boolean;
  /** key -> accepted values: OR within a key, AND across keys. */
  attr: Record<string, string[]>;
}

// Postgres full-text needs a few letters to mean anything (and the english config drops stop
// words), so one or two characters fall back to a plain substring match on the name.
const SHORT_QUERY_MAX = 2;

const tsQuery = (q: string) => sql`websearch_to_tsquery('english', ${q})`;

// `%` and `_` are wildcards in LIKE; a shopper typing "50%" means the characters.
const likeEscape = (q: string) => q.replace(/[\\%_]/g, '\\$&');

export interface ProductListParams {
  filters: ProductFilters;
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
function orderBy(sort: SortKey, v: ReturnType<typeof variantSummary>, q?: string): SQL[] {
  switch (sort) {
    case 'price_asc':
      return [asc(v.minCents), asc(products.id)];
    case 'price_desc':
      return [desc(v.minCents), asc(products.id)];
    case 'name':
      return [asc(sql`lower(${products.name})`), asc(products.id)];
    case 'relevance': {
      // Without a term there is nothing to rank by; newest is the sensible stand-in.
      if (!q) return [desc(products.createdAt), asc(products.id)];
      const rank =
        q.length <= SHORT_QUERY_MAX
          ? // Substring fallback has no score, so names that *start* with the input go first.
            sql`(${products.name} ilike ${likeEscape(q) + '%'})::int`
          : sql`ts_rank(${products.searchVector}, ${tsQuery(q)})`;
      return [desc(rank), desc(products.createdAt), asc(products.id)];
    }
    case 'newest':
      return [desc(products.createdAt), asc(products.id)];
  }
}

// The part of the filters that defines "what the shopper is browsing": active products in the
// category that match the search. Facets are computed over exactly this scope.
function scopeConditions(f: ProductFilters): SQL[] {
  const conds: SQL[] = [eq(products.status, 'active')];

  if (f.category) {
    // The category itself or any direct child (the tree is one level deep). An unknown slug
    // matches nothing, which correctly yields an empty list.
    const parent = db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, f.category));
    conds.push(
      inArray(
        products.categoryId,
        db
          .select({ id: categories.id })
          .from(categories)
          .where(or(eq(categories.slug, f.category), eq(categories.parentId, sql`(${parent})`))),
      ),
    );
  }

  if (f.q) {
    conds.push(
      f.q.length <= SHORT_QUERY_MAX
        ? ilike(products.name, `%${likeEscape(f.q)}%`)
        : // A query made only of stop words ("the") compiles to an empty tsquery that matches
          // nothing; treat that case as a name substring search instead of an empty page.
          sql`(case when numnode(${tsQuery(f.q)}) = 0
                then ${products.name} ilike ${'%' + likeEscape(f.q) + '%'}
                else ${products.searchVector} @@ ${tsQuery(f.q)} end)`,
    );
  }
  return conds;
}

// Scope plus the narrowing filters, composed with and(). The count query uses the same function
// as the list so `meta.total` can never disagree with the rows.
function filterConditions(f: ProductFilters, v: ReturnType<typeof variantSummary>): SQL[] {
  const conds = scopeConditions(f);

  if (f.minPriceCents !== undefined || f.maxPriceCents !== undefined) {
    // "Has a variant in the price range", not "min/max of the product overlap the range": a
    // shopper filtering 10-20 EUR expects something they can actually buy in that band.
    const inRange = [
      eq(productVariants.productId, products.id),
      eq(productVariants.status, 'active'),
      ...(f.minPriceCents !== undefined ? [gte(productVariants.priceCents, f.minPriceCents)] : []),
      ...(f.maxPriceCents !== undefined ? [lte(productVariants.priceCents, f.maxPriceCents)] : []),
    ];
    conds.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(productVariants)
          .where(and(...inRange)),
      ),
    );
  }

  if (f.inStock) conds.push(eq(v.inStock, true));

  for (const [key, values] of Object.entries(f.attr)) {
    // `@>` (containment) is what the GIN index on `attributes` accelerates, unlike
    // `attributes->>key = ...`. Values are bound as jsonb parameters, never string-built.
    conds.push(
      or(
        ...values.map(
          (value) => sql`${products.attributes} @> ${JSON.stringify({ [key]: value })}::jsonb`,
        ),
      ) ?? sql`false`,
    );
  }
  return conds;
}

export async function listProducts(
  params: ProductListParams,
): Promise<{ rows: ProductCardRow[]; total: number }> {
  const v = variantSummary();
  const where = and(...filterConditions(params.filters, v));

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
    .orderBy(...orderBy(params.sort, v, params.filters.q))
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

// ---------- facets ----------

export interface FacetRows {
  attributes: { key: string; value: string; count: number }[];
  price: { min: number; max: number } | null;
}

// Counts per attribute value over the *scope* (category + search), deliberately ignoring the
// attribute, price and stock filters: if counts honoured the filter the shopper just clicked,
// every other value would show 0 and the filter UI could only ever narrow, never switch.
export async function getFacets(
  filters: ProductFilters,
  keys: readonly string[],
): Promise<FacetRows> {
  const v = variantSummary();
  const where = and(...scopeConditions(filters));

  const [attributes, [price]] = await Promise.all([
    db
      .select({ key: sql<string>`kv.key`, value: sql<string>`kv.value`, count: count() })
      .from(products)
      .innerJoin(v, eq(v.productId, products.id))
      // jsonb_each_text turns each attribute into a (key, value) row, so one GROUP BY counts
      // every facet at once instead of one query per key.
      .innerJoin(sql`jsonb_each_text(${products.attributes}) as kv(key, value)`, sql`true`)
      .where(and(where, inArray(sql`kv.key`, [...keys])))
      .groupBy(sql`kv.key`, sql`kv.value`)
      .orderBy(sql`kv.key`, desc(count()), sql`kv.value`),
    db
      .select({
        min: sql<number | null>`min(${v.minCents})`,
        max: sql<number | null>`max(${v.maxCents})`,
      })
      .from(products)
      .innerJoin(v, eq(v.productId, products.id))
      .where(where),
  ]);

  return {
    attributes,
    price:
      price && price.min !== null && price.max !== null ? { min: price.min, max: price.max } : null,
  };
}

// ---------- product detail ----------

export interface VariantRow {
  id: string;
  sku: string;
  name: string;
  options: Record<string, string>;
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  isDefault: boolean;
  // Raw stock numbers stay inside the API; the service turns them into booleans.
  quantity: number;
  reserved: number;
  lowStockThreshold: number;
}

export interface ProductDetailRows {
  product: {
    id: string;
    slug: string;
    name: string;
    description: string;
    attributes: ProductAttributes;
  };
  category: { slug: string; name: string };
  parent: { slug: string; name: string } | null;
  variants: VariantRow[];
  images: ProductImageRow[];
}

// Only `active` products exist for the public: a draft or archived slug is indistinguishable from
// a missing one (admin preview arrives with phase 6).
export async function getProductBySlug(slug: string): Promise<ProductDetailRows | undefined> {
  const [head] = await db
    .select({
      product: {
        id: products.id,
        slug: products.slug,
        name: products.name,
        description: products.description,
        attributes: products.attributes,
      },
      category: { id: categories.id, slug: categories.slug, name: categories.name },
      parentId: categories.parentId,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), eq(products.status, 'active')));
  if (!head) return undefined;

  const [parentRows, variants, images] = await Promise.all([
    head.parentId
      ? db
          .select({ slug: categories.slug, name: categories.name })
          .from(categories)
          .where(eq(categories.id, head.parentId))
      : Promise.resolve([]),
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        name: productVariants.name,
        options: productVariants.options,
        priceCents: productVariants.priceCents,
        compareAtPriceCents: productVariants.compareAtPriceCents,
        currency: productVariants.currency,
        isDefault: productVariants.isDefault,
        // A variant row without an inventory row is treated as zero stock.
        quantity: sql<number>`coalesce(${inventory.quantity}, 0)`,
        reserved: sql<number>`coalesce(${inventory.reserved}, 0)`,
        lowStockThreshold: sql<number>`coalesce(${inventory.lowStockThreshold}, 0)`,
      })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(
        and(eq(productVariants.productId, head.product.id), eq(productVariants.status, 'active')),
      )
      // Cheapest first so the picker's order is stable; default variant is flagged, not sorted.
      .orderBy(asc(productVariants.priceCents), asc(productVariants.name), asc(productVariants.id)),
    db
      .select({
        id: productImages.id,
        productId: productImages.productId,
        variantId: productImages.variantId,
        url: productImages.url,
        alt: productImages.alt,
        width: productImages.width,
        height: productImages.height,
      })
      .from(productImages)
      .where(eq(productImages.productId, head.product.id))
      .orderBy(asc(productImages.sortOrder), asc(productImages.id)),
  ]);

  return {
    product: head.product,
    category: { slug: head.category.slug, name: head.category.name },
    parent: parentRows[0] ?? null,
    variants,
    images,
  };
}
