import { and, asc, count, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';

import { db, type Tx } from '../../../db/client.ts';
import {
  brands,
  cartItems,
  categories,
  inventory,
  inventoryAdjustments,
  productImages,
  productTags,
  productVariants,
  products,
  tags,
} from '../../../db/schema/index.ts';

type Db = typeof db | Tx;

export type ProductRow = typeof products.$inferSelect;
export type VariantRow = typeof productVariants.$inferSelect;
export type InventoryRow = typeof inventory.$inferSelect;
export type ImageRow = typeof productImages.$inferSelect;
export type VariantWithStock = VariantRow & { inventory: InventoryRow | null };

// `%` and `_` are wildcards in LIKE; a search for "50%" must find "50%", not everything.
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// ---------- list ----------

export async function listProducts(opts: {
  q?: string | undefined;
  status?: ProductRow['status'] | undefined;
  page: number;
  limit: number;
}) {
  const conditions = [];
  if (opts.status) conditions.push(eq(products.status, opts.status));
  if (opts.q) {
    const pattern = likePattern(opts.q);
    conditions.push(
      or(
        ilike(products.name, pattern),
        ilike(products.slug, pattern),
        // A SKU search finds the product that owns it.
        sql`exists (select 1 from ${productVariants} where ${productVariants.productId} = ${products.id} and ${ilike(productVariants.sku, pattern)})`,
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  // One grouped subquery for the variant numbers (not one query per row).
  const agg = db
    .select({
      productId: productVariants.productId,
      variantCount: count().as('variant_count'),
      minPrice: sql<number>`min(${productVariants.priceCents})`.as('min_price'),
      maxPrice: sql<number>`max(${productVariants.priceCents})`.as('max_price'),
      currency: sql<string>`min(${productVariants.currency})`.as('agg_currency'),
      available: sql<number>`coalesce(sum(${inventory.quantity} - ${inventory.reserved}), 0)`.as(
        'available',
      ),
    })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .groupBy(productVariants.productId)
    .as('agg');

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        status: products.status,
        categoryName: categories.name,
        variantCount: agg.variantCount,
        minPrice: agg.minPrice,
        maxPrice: agg.maxPrice,
        currency: agg.currency,
        available: agg.available,
        imageUrl: sql<
          string | null
        >`(select ${productImages.url} from ${productImages} where ${productImages.productId} = ${products.id} order by ${productImages.sortOrder}, ${productImages.createdAt} limit 1)`,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(agg, eq(agg.productId, products.id))
      .where(where)
      .orderBy(desc(products.updatedAt), desc(products.id))
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit),
    db.select({ n: count() }).from(products).where(where),
  ]);
  return { rows, total: totals[0]?.n ?? 0 };
}

// ---------- reads ----------

export async function findProduct(run: Db, id: string): Promise<ProductRow | undefined> {
  const [row] = await run.select().from(products).where(eq(products.id, id));
  return row;
}

// FOR UPDATE on the product row serialises every structural edit of one product (variants, default
// flag, images), so two admins cannot interleave and leave two defaults or none.
export async function lockProduct(tx: Tx, id: string): Promise<ProductRow | undefined> {
  const [row] = await tx.select().from(products).where(eq(products.id, id)).for('update');
  return row;
}

export async function findProductSlug(run: Db, slug: string): Promise<boolean> {
  const [row] = await run.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  return row !== undefined;
}

export async function findCategory(run: Db, id: string) {
  const [row] = await run.select().from(categories).where(eq(categories.id, id));
  return row;
}

export async function listVariants(run: Db, productId: string): Promise<VariantWithStock[]> {
  const rows = await run
    .select({ variant: productVariants, inventory })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(productVariants.productId, productId))
    .orderBy(
      desc(productVariants.isDefault),
      asc(productVariants.createdAt),
      asc(productVariants.id),
    );
  return rows.map((r) => ({ ...r.variant, inventory: r.inventory }));
}

export async function findVariant(run: Db, id: string): Promise<VariantRow | undefined> {
  const [row] = await run.select().from(productVariants).where(eq(productVariants.id, id));
  return row;
}

export async function findVariantWithStock(
  run: Db,
  id: string,
): Promise<VariantWithStock | undefined> {
  const [row] = await run
    .select({ variant: productVariants, inventory })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(productVariants.id, id));
  return row ? { ...row.variant, inventory: row.inventory } : undefined;
}

export async function listImages(run: Db, productId: string): Promise<ImageRow[]> {
  return run
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt), asc(productImages.id));
}

// ---------- writes ----------

export async function insertProduct(tx: Tx, values: typeof products.$inferInsert) {
  const [row] = await tx.insert(products).values(values).returning();
  if (!row) throw new Error('product insert returned no row');
  return row;
}

// Always writes `updated_at`: the trigger only fires on an UPDATE, and an image-only edit changes
// nothing else, so without this the "last edited" stamp would miss it.
export async function updateProduct(
  tx: Tx,
  id: string,
  values: Partial<typeof products.$inferInsert>,
) {
  await tx
    .update(products)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(products.id, id));
}

export async function insertVariant(tx: Tx, values: typeof productVariants.$inferInsert) {
  const [row] = await tx.insert(productVariants).values(values).returning();
  if (!row) throw new Error('variant insert returned no row');
  return row;
}

export async function updateVariant(
  tx: Tx,
  id: string,
  values: Partial<typeof productVariants.$inferInsert>,
) {
  await tx
    .update(productVariants)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(productVariants.id, id));
}

// Clears the default flag first so the one-default-per-product partial unique index never sees two.
export async function demoteDefaults(tx: Tx, productId: string, exceptVariantId?: string) {
  await tx
    .update(productVariants)
    .set({ isDefault: false })
    .where(
      and(
        eq(productVariants.productId, productId),
        eq(productVariants.isDefault, true),
        exceptVariantId ? ne(productVariants.id, exceptVariantId) : undefined,
      ),
    );
}

export async function deleteVariant(tx: Tx, id: string) {
  // The cart FK has no cascade, so lines holding this variant must go first. Carts are re-priced
  // on every read, so a vanished line simply disappears from the cart.
  await tx.delete(cartItems).where(eq(cartItems.variantId, id));
  await tx.delete(productVariants).where(eq(productVariants.id, id));
}

export async function insertInventory(tx: Tx, values: typeof inventory.$inferInsert) {
  await tx.insert(inventory).values(values);
}

export async function insertAdjustment(tx: Tx, values: typeof inventoryAdjustments.$inferInsert) {
  await tx.insert(inventoryAdjustments).values(values);
}

export async function replaceImages(
  tx: Tx,
  productId: string,
  images: Omit<typeof productImages.$inferInsert, 'productId'>[],
) {
  await tx.delete(productImages).where(eq(productImages.productId, productId));
  // One statement per image keeps `created_at` ordered (a batch shares one timestamp).
  for (const image of images) await tx.insert(productImages).values({ ...image, productId });
}

export async function lockInventoryRow(
  tx: Tx,
  variantId: string,
): Promise<InventoryRow | undefined> {
  const [row] = await tx
    .select()
    .from(inventory)
    .where(eq(inventory.variantId, variantId))
    .for('update');
  return row;
}

export async function setInventoryQuantity(tx: Tx, variantId: string, quantity: number) {
  await tx
    .update(inventory)
    .set({ quantity, updatedAt: sql`now()` })
    .where(eq(inventory.variantId, variantId));
}

export async function setLowStockThreshold(tx: Tx, variantId: string, threshold: number) {
  await tx
    .update(inventory)
    .set({ lowStockThreshold: threshold, updatedAt: sql`now()` })
    .where(eq(inventory.variantId, variantId));
}

export async function brandExists(run: Db, id: string): Promise<boolean> {
  const [row] = await run.select({ id: brands.id }).from(brands).where(eq(brands.id, id));
  return row !== undefined;
}

export async function listProductTags(run: Db, productId: string) {
  return run
    .select({ id: tags.id, slug: tags.slug, name: tags.name })
    .from(productTags)
    .innerJoin(tags, eq(tags.id, productTags.tagId))
    .where(eq(productTags.productId, productId))
    .orderBy(asc(tags.name));
}
