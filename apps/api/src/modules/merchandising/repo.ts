import { asc, count, eq, inArray, sql } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import {
  brands,
  collectionProducts,
  collections,
  productTags,
  products,
  tags,
} from '../../db/schema/index.ts';

type Db = typeof db | Tx;

export type BrandRow = typeof brands.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;
export type TagRow = typeof tags.$inferSelect;

// ---------- brands ----------

// Active products only, so a brand page never advertises a count its listing cannot show.
const activeCount = <T extends typeof products.brandId>(column: T) =>
  db
    .select({ key: column, n: count().as('n') })
    .from(products)
    .where(eq(products.status, 'active'))
    .groupBy(column)
    .as('brand_counts');

export async function listBrands(): Promise<(BrandRow & { productCount: number })[]> {
  const counts = activeCount(products.brandId);
  const rows = await db
    .select({ brand: brands, n: sql<number>`coalesce(${counts.n}, 0)::int` })
    .from(brands)
    .leftJoin(counts, eq(counts.key, brands.id))
    .orderBy(asc(brands.name));
  return rows.map((r) => ({ ...r.brand, productCount: r.n }));
}

export async function findBrandBySlug(slug: string) {
  return (await listBrands()).find((b) => b.slug === slug);
}

export async function findBrand(run: Db, id: string) {
  const [row] = await run.select().from(brands).where(eq(brands.id, id));
  return row;
}

export async function insertBrand(values: typeof brands.$inferInsert) {
  const [row] = await db.insert(brands).values(values).returning();
  if (!row) throw new Error('brand insert returned no row');
  return row;
}

export async function updateBrand(id: string, values: Partial<typeof brands.$inferInsert>) {
  await db.update(brands).set(values).where(eq(brands.id, id));
}

export async function deleteBrand(id: string) {
  await db.delete(brands).where(eq(brands.id, id));
}

// ---------- collections ----------

export async function listCollectionRows(): Promise<(CollectionRow & { productCount: number })[]> {
  const counts = db
    .select({ collectionId: collectionProducts.collectionId, n: count().as('n') })
    .from(collectionProducts)
    .innerJoin(products, eq(products.id, collectionProducts.productId))
    .where(eq(products.status, 'active'))
    .groupBy(collectionProducts.collectionId)
    .as('collection_counts');
  const rows = await db
    .select({ collection: collections, n: sql<number>`coalesce(${counts.n}, 0)::int` })
    .from(collections)
    .leftJoin(counts, eq(counts.collectionId, collections.id))
    .orderBy(asc(collections.sortOrder), asc(collections.name));
  return rows.map((r) => ({ ...r.collection, productCount: r.n }));
}

export async function findCollection(run: Db, id: string) {
  const [row] = await run.select().from(collections).where(eq(collections.id, id));
  return row;
}

export async function insertCollection(values: typeof collections.$inferInsert) {
  const [row] = await db.insert(collections).values(values).returning();
  if (!row) throw new Error('collection insert returned no row');
  return row;
}

export async function updateCollection(
  id: string,
  values: Partial<typeof collections.$inferInsert>,
) {
  await db.update(collections).set(values).where(eq(collections.id, id));
}

export async function deleteCollection(id: string) {
  await db.delete(collections).where(eq(collections.id, id));
}

// The members with their names, in the editor's order (all statuses: an admin sees drafts too).
export async function listCollectionMembers(collectionId: string) {
  return db
    .select({ id: products.id, name: products.name, slug: products.slug })
    .from(collectionProducts)
    .innerJoin(products, eq(products.id, collectionProducts.productId))
    .where(eq(collectionProducts.collectionId, collectionId))
    .orderBy(asc(collectionProducts.position), asc(products.id));
}

export async function countExistingProducts(run: Db, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const [row] = await run.select({ n: count() }).from(products).where(inArray(products.id, ids));
  return row?.n ?? 0;
}

export async function replaceCollectionProducts(tx: Tx, collectionId: string, ids: string[]) {
  await tx.delete(collectionProducts).where(eq(collectionProducts.collectionId, collectionId));
  if (ids.length > 0) {
    await tx
      .insert(collectionProducts)
      .values(ids.map((productId, position) => ({ collectionId, productId, position })));
  }
}

// ---------- tags ----------

export async function listTags(): Promise<(TagRow & { productCount: number })[]> {
  const rows = await db
    .select({
      tag: tags,
      n: sql<number>`count(${products.id}) filter (where ${products.status} = 'active')::int`,
    })
    .from(tags)
    .leftJoin(productTags, eq(productTags.tagId, tags.id))
    .leftJoin(products, eq(products.id, productTags.productId))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
  return rows.map((r) => ({ ...r.tag, productCount: r.n }));
}

export async function insertTag(values: typeof tags.$inferInsert) {
  const [row] = await db.insert(tags).values(values).returning();
  if (!row) throw new Error('tag insert returned no row');
  return row;
}

export async function updateTag(id: string, name: string) {
  const rows = await db.update(tags).set({ name }).where(eq(tags.id, id)).returning();
  return rows[0];
}

export async function deleteTag(id: string) {
  const rows = await db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
  return rows.length > 0;
}

export async function countExistingTags(run: Db, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const [row] = await run.select({ n: count() }).from(tags).where(inArray(tags.id, ids));
  return row?.n ?? 0;
}

export async function listProductTags(productId: string) {
  return db
    .select({ id: tags.id, slug: tags.slug, name: tags.name })
    .from(productTags)
    .innerJoin(tags, eq(tags.id, productTags.tagId))
    .where(eq(productTags.productId, productId))
    .orderBy(asc(tags.name));
}

export async function productExists(run: Db, id: string): Promise<boolean> {
  const [row] = await run.select({ id: products.id }).from(products).where(eq(products.id, id));
  return row !== undefined;
}

export async function replaceProductTags(tx: Tx, productId: string, tagIds: string[]) {
  await tx.delete(productTags).where(eq(productTags.productId, productId));
  if (tagIds.length > 0) {
    await tx.insert(productTags).values(tagIds.map((tagId) => ({ productId, tagId })));
  }
}
