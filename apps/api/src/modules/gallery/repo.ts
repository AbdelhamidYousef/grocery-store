import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { stockQuantity, stockReserved } from '../../db/available.ts';
import { db } from '../../db/client.ts';
import {
  galleryPhotoProducts,
  galleryPhotos,
  inventory,
  productImages,
  productVariants,
  products,
} from '../../db/schema/index.ts';
import { currentStore } from '../i18n/context.ts';
import { hasPriceIn, priceIn } from '../i18n/prices.ts';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PhotoRow = typeof galleryPhotos.$inferSelect;

export async function listPhotos(opts: { onlyPublished: boolean; productId?: string }) {
  const conds = [
    opts.onlyPublished ? eq(galleryPhotos.published, true) : undefined,
    opts.productId
      ? inArray(
          galleryPhotos.id,
          db
            .select({ id: galleryPhotoProducts.photoId })
            .from(galleryPhotoProducts)
            .where(eq(galleryPhotoProducts.productId, opts.productId)),
        )
      : undefined,
  ];
  return db
    .select()
    .from(galleryPhotos)
    .where(and(...conds))
    .orderBy(asc(galleryPhotos.sortOrder), asc(galleryPhotos.createdAt), asc(galleryPhotos.id));
}

export async function findPhoto(id: string) {
  const [row] = await db.select().from(galleryPhotos).where(eq(galleryPhotos.id, id));
  return row;
}

export async function findPhotoIn(tx: Tx, id: string) {
  const [row] = await tx.select().from(galleryPhotos).where(eq(galleryPhotos.id, id));
  return row;
}

export async function linksFor(photoIds: string[]) {
  if (photoIds.length === 0) return [];
  return db
    .select({ photoId: galleryPhotoProducts.photoId, productId: galleryPhotoProducts.productId })
    .from(galleryPhotoProducts)
    .where(inArray(galleryPhotoProducts.photoId, photoIds));
}

// Which of these ids are real products (a stale id in the admin form must be a 400, not a 500
// from the foreign key).
export async function existingProductIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.select({ id: products.id }).from(products).where(inArray(products.id, ids));
  return new Set(rows.map((r) => r.id));
}

export async function insertPhoto(
  tx: Tx,
  values: { path: string; caption: string; petName: string; sortOrder: number; published: boolean },
) {
  const [row] = await tx.insert(galleryPhotos).values(values).returning();
  if (!row) throw new Error('insert of gallery photo returned no row');
  return row;
}

export async function updatePhoto(
  tx: Tx,
  id: string,
  values: Partial<typeof galleryPhotos.$inferInsert>,
) {
  if (Object.keys(values).length === 0) {
    const [row] = await tx.select().from(galleryPhotos).where(eq(galleryPhotos.id, id));
    return row;
  }
  const [row] = await tx
    .update(galleryPhotos)
    .set(values)
    .where(eq(galleryPhotos.id, id))
    .returning();
  return row;
}

export async function replaceLinks(tx: Tx, photoId: string, productIds: string[]) {
  await tx.delete(galleryPhotoProducts).where(eq(galleryPhotoProducts.photoId, photoId));
  if (productIds.length > 0) {
    await tx
      .insert(galleryPhotoProducts)
      .values(productIds.map((productId) => ({ photoId, productId })));
  }
}

export async function deletePhoto(id: string) {
  const rows = await db.delete(galleryPhotos).where(eq(galleryPhotos.id, id)).returning();
  return rows[0];
}

// What the modal needs to sell: only ACTIVE products, a first picture, the price, and the variant
// "Add to cart" will use. Kit stock is derived (db/available.ts), the same helper as the catalog.
export async function shoppableProducts(productIds: string[]) {
  if (productIds.length === 0) return { products: [], variants: [], images: [] };
  const [prods, variants, images] = await Promise.all([
    db
      .select({ id: products.id, slug: products.slug, name: products.name })
      .from(products)
      .where(and(inArray(products.id, productIds), eq(products.status, 'active'))),
    db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        priceCents: priceIn(),
        currency: sql<string>`${currentStore().currency}::char(3)`,
        isDefault: productVariants.isDefault,
        available: sql<boolean>`coalesce(${stockQuantity(productVariants.id)} - ${stockReserved(productVariants.id)} > 0, false)`,
      })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(
        and(
          inArray(productVariants.productId, productIds),
          eq(productVariants.status, 'active'),
          eq(productVariants.isTrial, false),
          hasPriceIn(),
        ),
      )
      .orderBy(asc(priceIn()), asc(productVariants.id)),
    db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        variantId: productImages.variantId,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.sortOrder), asc(productImages.id)),
  ]);
  return { products: prods, variants, images };
}
