import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, db } from './client.ts';
import { runMigrations } from './migrate.ts';
import { categories, inventory, productVariants, products } from './schema/index.ts';

const categorySlug = 'catalog-test-category';

async function insertProduct(slug: string, name: string, description: string) {
  const [category] = await db.select().from(categories).where(eq(categories.slug, categorySlug));
  if (!category) throw new Error('missing test category');
  const [product] = await db
    .insert(products)
    .values({ slug, name, description, categoryId: category.id, status: 'active' })
    .returning();
  if (!product) throw new Error('insert returned no row');
  return product;
}

async function cleanup() {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, categorySlug));
  for (const row of rows) await db.delete(products).where(eq(products.categoryId, row.id));
  await db.delete(categories).where(eq(categories.slug, categorySlug));
}

describe('catalog tables', () => {
  beforeAll(async () => {
    await runMigrations();
    await cleanup();
    await db.insert(categories).values({ slug: categorySlug, name: 'Catalog test' });
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('finds a product by full-text search on name and description', async () => {
    await insertProduct(
      'rope-toy-test',
      'Tug Rope',
      'A chewy braided rope for fetch and tug games',
    );
    await insertProduct('bed-test', 'Cloud Bed', 'A soft round bed for naps');

    const found = await db
      .select({ slug: products.slug })
      .from(products)
      .where(sql`${products.searchVector} @@ to_tsquery('english', 'braided & rope')`);

    expect(found).toEqual([{ slug: 'rope-toy-test' }]);
  });

  it('stems words so "napping" matches "naps"', async () => {
    const found = await db
      .select({ slug: products.slug })
      .from(products)
      .where(sql`${products.searchVector} @@ websearch_to_tsquery('english', 'napping')`);

    expect(found.map((r) => r.slug)).toContain('bed-test');
  });

  it('stores variants with stock and rejects a duplicate options combination', async () => {
    const product = await insertProduct('variant-test', 'Chew Ball', 'A bouncy ball');
    const variant = {
      productId: product.id,
      sku: 'PW-TEST-BALL-RED-S',
      name: 'Red · Small',
      options: { color: 'red', size: 'S' },
      priceCents: 599,
      weightGrams: 120,
      isDefault: true,
    };
    const [created] = await db.insert(productVariants).values(variant).returning();
    if (!created) throw new Error('insert returned no row');
    await db.insert(inventory).values({ variantId: created.id, quantity: 10 });

    // Same product + same options is the same variant, even with a different SKU.
    await expect(
      db
        .insert(productVariants)
        .values({ ...variant, sku: 'PW-TEST-BALL-RED-S2', isDefault: false }),
    ).rejects.toThrow();
    // A negative price or negative stock is rejected by check constraints.
    await expect(
      db.insert(productVariants).values({
        ...variant,
        sku: 'PW-TEST-NEG',
        options: { color: 'blue', size: 'S' },
        isDefault: false,
        priceCents: -1,
      }),
    ).rejects.toThrow();
    await expect(
      db.update(inventory).set({ quantity: -1 }).where(eq(inventory.variantId, created.id)),
    ).rejects.toThrow();
  });
});
