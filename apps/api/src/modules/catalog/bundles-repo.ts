import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { inventoryAt, stockQuantity, stockReserved } from '../../db/available.ts';
import { db } from '../../db/client.ts';
import { bundleItems, inventory, productVariants, products } from '../../db/schema/index.ts';
import { hasPriceIn, priceIn } from '../i18n/prices.ts';

export interface BundleLineRow {
  bundleVariantId: string;
  componentVariantId: string;
  productSlug: string;
  productName: string;
  variantName: string;
  qty: number;
  priceCents: number;
}

// The parts of the given kits, in a stable order (name, then id), with what each costs on its own.
export async function listBundleLines(bundleVariantIds: string[]): Promise<BundleLineRow[]> {
  if (bundleVariantIds.length === 0) return [];
  return db
    .select({
      bundleVariantId: bundleItems.bundleVariantId,
      componentVariantId: bundleItems.componentVariantId,
      productSlug: products.slug,
      productName: products.name,
      variantName: productVariants.name,
      qty: bundleItems.qty,
      // A part with no price in this store counts as 0 in the saving; the kit itself is hidden if unpriced.
      priceCents: sql<number>`coalesce(${priceIn()}, 0)`,
    })
    .from(bundleItems)
    .innerJoin(productVariants, eq(productVariants.id, bundleItems.componentVariantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(bundleItems.bundleVariantId, bundleVariantIds))
    .orderBy(asc(products.name), asc(bundleItems.componentVariantId));
}

export interface KitRow {
  variantId: string;
  slug: string;
  name: string;
  priceCents: number;
  available: boolean;
}

// Active kits that contain any variant of `productId` ("Make it a kit"), with derived availability.
export async function listKitsContaining(productId: string): Promise<KitRow[]> {
  const mine = db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
  const rows = await db
    .selectDistinct({
      variantId: productVariants.id,
      slug: products.slug,
      name: products.name,
      priceCents: priceIn(),
      quantity: sql<number>`coalesce(${stockQuantity(productVariants.id)}, 0)`,
      reserved: sql<number>`coalesce(${stockReserved(productVariants.id)}, 0)`,
    })
    .from(bundleItems)
    .innerJoin(productVariants, eq(productVariants.id, bundleItems.bundleVariantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, inventoryAt(productVariants.id))
    .where(
      and(
        inArray(bundleItems.componentVariantId, mine),
        eq(products.status, 'active'),
        eq(productVariants.status, 'active'),
        hasPriceIn(),
      ),
    )
    .orderBy(asc(priceIn()), asc(products.slug));
  return rows.map((r) => ({
    variantId: r.variantId,
    slug: r.slug,
    name: r.name,
    priceCents: r.priceCents,
    available: r.quantity - r.reserved > 0,
  }));
}
