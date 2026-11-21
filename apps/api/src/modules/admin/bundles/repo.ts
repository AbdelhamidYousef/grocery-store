import { and, asc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';

import { inventoryAt, stockQuantity, stockReserved } from '../../../db/available.ts';
import { db, type Tx } from '../../../db/client.ts';
import {
  bundleItems,
  inventory,
  productImages,
  productVariants,
  products,
} from '../../../db/schema/index.ts';
import { DEFAULT_STORE_ID } from '../../../db/seed/delivery.ts';

type Run = typeof db | Tx;

// A component as the form and the checks need it.
export async function listVariantsById(run: Run, ids: string[]) {
  if (ids.length === 0) return [];
  return run
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      name: productVariants.name,
      priceCents: productVariants.priceCents,
      currency: productVariants.currency,
      weightGrams: productVariants.weightGrams,
      isTrial: productVariants.isTrial,
      status: productVariants.status,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      productStatus: products.status,
      productKind: products.kind,
      categoryId: products.categoryId,
      brandId: products.brandId,
      attributes: products.attributes,
      available: sql<number>`greatest(coalesce(${inventory.quantity} - ${inventory.reserved}, 0), 0)`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, inventoryAt(productVariants.id, DEFAULT_STORE_ID))
    .where(inArray(productVariants.id, ids));
}

// Which of these variants are themselves kits (a kit cannot hold a kit).
export async function bundleVariantsAmong(run: Run, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await run
    .selectDistinct({ id: bundleItems.bundleVariantId })
    .from(bundleItems)
    .where(inArray(bundleItems.bundleVariantId, ids));
  return new Set(rows.map((r) => r.id));
}

// The kits that use this variant as a part (a variant that is a part cannot become a kit).
export async function usedAsComponent(run: Run, variantId: string): Promise<boolean> {
  const rows = await run
    .select({ id: bundleItems.bundleVariantId })
    .from(bundleItems)
    .where(eq(bundleItems.componentVariantId, variantId))
    .limit(1);
  return rows.length > 0;
}

export async function listBundleRows(run: Run, onlyVariantId?: string) {
  return run
    .select({
      variantId: productVariants.id,
      productId: products.id,
      slug: products.slug,
      name: products.name,
      priceCents: productVariants.priceCents,
      quantity: sql<number>`coalesce(${stockQuantity(productVariants.id, DEFAULT_STORE_ID)}, 0)`,
      reserved: sql<number>`coalesce(${stockReserved(productVariants.id, DEFAULT_STORE_ID)}, 0)`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, inventoryAt(productVariants.id, DEFAULT_STORE_ID))
    .where(
      and(
        eq(products.kind, 'bundle'),
        ne(products.status, 'archived'),
        ...(onlyVariantId ? [eq(productVariants.id, onlyVariantId)] : []),
      ),
    )
    .orderBy(asc(products.name), asc(productVariants.id));
}

export async function listBundleItems(run: Run, bundleVariantIds: string[]) {
  if (bundleVariantIds.length === 0) return [];
  return run
    .select({
      bundleVariantId: bundleItems.bundleVariantId,
      componentVariantId: bundleItems.componentVariantId,
      qty: bundleItems.qty,
    })
    .from(bundleItems)
    .where(inArray(bundleItems.bundleVariantId, bundleVariantIds))
    .orderBy(asc(bundleItems.componentVariantId));
}

export async function replaceItems(
  tx: Tx,
  bundleVariantId: string,
  items: { variantId: string; qty: number }[],
): Promise<void> {
  await tx.delete(bundleItems).where(eq(bundleItems.bundleVariantId, bundleVariantId));
  await tx.insert(bundleItems).values(
    items.map((i) => ({
      bundleVariantId,
      componentVariantId: i.variantId,
      qty: i.qty,
    })),
  );
}

export async function searchVariants(run: Run, q: string | undefined, limit: number) {
  const like = q ? `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : undefined;
  return run
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      variantName: productVariants.name,
      productName: products.name,
      priceCents: productVariants.priceCents,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(products.status, 'active'),
        eq(products.kind, 'simple'),
        eq(productVariants.status, 'active'),
        eq(productVariants.isTrial, false),
        ...(like
          ? [
              or(
                ilike(products.name, like),
                ilike(productVariants.name, like),
                ilike(productVariants.sku, like),
              ),
            ]
          : []),
      ),
    )
    .orderBy(asc(products.name), asc(productVariants.priceCents))
    .limit(limit);
}

export async function firstImageUrl(run: Run, productId: string) {
  const [row] = await run
    .select({
      url: productImages.url,
      width: productImages.width,
      height: productImages.height,
    })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sortOrder))
    .limit(1);
  return row;
}

export async function lockProduct(tx: Tx, productId: string) {
  await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .for('update');
}
