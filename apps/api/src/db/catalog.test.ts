import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createProduct } from '../test/factories.ts';

import { db } from './client.ts';
import { inventory, productVariants, products } from './schema/index.ts';

describe('catalog tables', () => {
  it('finds a product by full-text search on name and description', async () => {
    const rope = await createProduct({
      name: 'Tug Rope',
      description: 'A chewy braided rope for fetch and tug games',
    });
    await createProduct({ name: 'Cloud Bed', description: 'A soft round bed for naps' });

    const found = await db
      .select({ slug: products.slug })
      .from(products)
      .where(sql`${products.searchVector} @@ to_tsquery('english', 'braided & rope')`);

    expect(found).toEqual([{ slug: rope.product.slug }]);
  });

  it('stems words so "napping" matches "naps"', async () => {
    const bed = await createProduct({
      name: 'Cloud Bed',
      description: 'A soft round bed for naps',
    });

    const found = await db
      .select({ slug: products.slug })
      .from(products)
      .where(sql`${products.searchVector} @@ websearch_to_tsquery('english', 'napping')`);

    expect(found).toEqual([{ slug: bed.product.slug }]);
  });

  it('rejects a duplicate options combination, a negative price and negative stock', async () => {
    const { product, variants } = await createProduct({
      variants: [{ options: { color: 'red', size: 'S' } }],
    });
    const created = variants[0];
    if (!created) throw new Error('no variant');
    const variant = {
      productId: product.id,
      sku: 'PW-TEST-DUP',
      name: 'Red · Small again',
      options: { color: 'red', size: 'S' },
      priceCents: 599,
      weightGrams: 120,
    };

    // Same product + same options is the same variant, even with a different SKU.
    await expect(db.insert(productVariants).values(variant)).rejects.toThrow();
    await expect(
      db
        .insert(productVariants)
        .values({ ...variant, options: { color: 'blue', size: 'S' }, priceCents: -1 }),
    ).rejects.toThrow();
    await expect(
      db.update(inventory).set({ quantity: -1 }).where(eq(inventory.variantId, created.id)),
    ).rejects.toThrow();
  });
});
