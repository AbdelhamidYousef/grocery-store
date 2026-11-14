import { readFileSync } from 'node:fs';

import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createProduct } from '../test/factories.ts';

import { db } from './client.ts';
import {
  brands,
  collectionProducts,
  collections,
  orders,
  productTags,
  productVariants,
  products,
  tags,
  trialRedemptions,
} from './schema/index.ts';

async function createOrder() {
  const [order] = await db
    .insert(orders)
    .values({
      email: 'a@x.test',
      subtotalCents: 1000,
      shippingCents: 0,
      totalCents: 1000,
      shippingMethodCode: 'standard',
      shippingMethodName: 'Standard',
      shippingAddress: { fullName: 'A', line1: '1', city: 'Riga', postalCode: '1', country: 'DE' },
    })
    .returning();
  if (!order) throw new Error('order insert returned no row');
  return order;
}

async function variantOf(overrides: Partial<typeof productVariants.$inferInsert>) {
  const { product } = await createProduct();
  return db
    .insert(productVariants)
    .values({
      productId: product.id,
      sku: `SKU-${Math.random().toString(36).slice(2)}`,
      name: 'Extra',
      options: { extra: 'yes' },
      priceCents: 500,
      weightGrams: 100,
      ...overrides,
    })
    .returning();
}

describe('catalogue depth schema', () => {
  it('rejects a duplicate brand, collection or tag slug', async () => {
    await db.insert(brands).values({ slug: 'scaleby', name: 'Scaleby' });
    await expect(db.insert(brands).values({ slug: 'scaleby', name: 'Again' })).rejects.toThrow();
    await db.insert(tags).values({ slug: 'joints', name: 'Joints' });
    await expect(db.insert(tags).values({ slug: 'joints', name: 'Again' })).rejects.toThrow();
    await db.insert(collections).values({ slug: 'halloween', name: 'Halloween' });
    await expect(
      db.insert(collections).values({ slug: 'halloween', name: 'Again' }),
    ).rejects.toThrow();
  });

  it('rejects a collection window that ends before it starts', async () => {
    const starts = new Date('2026-10-01T00:00:00Z');
    await expect(
      db.insert(collections).values({
        slug: 'bad-window',
        name: 'Bad',
        startsAt: starts,
        endsAt: new Date('2026-09-01T00:00:00Z'),
      }),
    ).rejects.toThrow();
    // An open-ended window (only a start) is fine.
    await db.insert(collections).values({ slug: 'open', name: 'Open', startsAt: starts });
  });

  it('keeps a product once per collection and per tag', async () => {
    const { product } = await createProduct();
    const [collection] = await db.insert(collections).values({ slug: 'c', name: 'C' }).returning();
    const [tag] = await db.insert(tags).values({ slug: 't', name: 'T' }).returning();
    if (!collection || !tag) throw new Error('setup');

    await db
      .insert(collectionProducts)
      .values({ collectionId: collection.id, productId: product.id, position: 0 });
    await expect(
      db
        .insert(collectionProducts)
        .values({ collectionId: collection.id, productId: product.id, position: 1 }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(collectionProducts)
        .values({ collectionId: collection.id, productId: product.id, position: -1 }),
    ).rejects.toThrow();

    await db.insert(productTags).values({ productId: product.id, tagId: tag.id });
    await expect(
      db.insert(productTags).values({ productId: product.id, tagId: tag.id }),
    ).rejects.toThrow();
  });

  it('keeps the product when its brand is deleted', async () => {
    const [brand] = await db.insert(brands).values({ slug: 'b', name: 'B' }).returning();
    if (!brand) throw new Error('setup');
    const { product } = await createProduct();
    await db.update(products).set({ brandId: brand.id }).where(eq(products.id, product.id));
    await db.delete(brands).where(eq(brands.id, brand.id));
    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    expect(after?.brandId).toBeNull();
  });

  it('accepts a net amount with a unit and rejects a lonely or non-positive one', async () => {
    await variantOf({ netAmount: 500, netUnit: 'g' });
    await expect(variantOf({ netAmount: 500 })).rejects.toThrow();
    await expect(variantOf({ netUnit: 'ml' })).rejects.toThrow();
    await expect(variantOf({ netAmount: 0, netUnit: 'g' })).rejects.toThrow();
  });

  it('only accepts #RRGGBB swatch colours', async () => {
    await variantOf({ swatchHex: '#a1B2c3' });
    await expect(variantOf({ swatchHex: 'red' })).rejects.toThrow();
    await expect(variantOf({ swatchHex: '#fff' })).rejects.toThrow();
  });

  it('allows one live trial redemption per customer and variant, until it is released', async () => {
    const [variant] = await variantOf({ isTrial: true, netAmount: 50, netUnit: 'g' });
    const order = await createOrder();
    if (!variant) throw new Error('setup');
    const row = { customerKey: 'a@x.test', variantId: variant.id, orderId: order.id };

    const [first] = await db.insert(trialRedemptions).values(row).returning();
    await expect(db.insert(trialRedemptions).values(row)).rejects.toThrow();
    // A different customer is unaffected.
    await db.insert(trialRedemptions).values({ ...row, customerKey: 'b@x.test' });

    // Releasing the first (cancelled order) frees the slot again.
    await db
      .update(trialRedemptions)
      .set({ releasedAt: new Date() })
      .where(eq(trialRedemptions.id, first?.id ?? ''));
    await db.insert(trialRedemptions).values(row);
  });

  it('migrates a jsonb brand into brand_id and drops the key', async () => {
    const { product } = await createProduct();
    await db.execute(
      sql`update products set attributes = '{"brand":"Wagtail & Co","pet":"dog"}'::jsonb where id = ${product.id}`,
    );
    // Re-run the data part of migration 0008 (everything after its marker comment).
    const file = readFileSync(
      new URL('./migrations/0008_catalogue_depth.sql', import.meta.url),
      'utf8',
    );
    const data = file.slice(file.indexOf('-- Data migration'));
    for (const statement of data.split('--> statement-breakpoint').filter((s) => s.includes('"')))
      await db.execute(sql.raw(statement.replace(/^--.*$/gm, '')));

    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    const [brand] = await db.select().from(brands);
    expect(brand).toMatchObject({ slug: 'wagtail-co', name: 'Wagtail & Co' });
    expect(after?.brandId).toBe(brand?.id);
    expect(after?.attributes).toEqual({ pet: 'dog' });
  });
});
