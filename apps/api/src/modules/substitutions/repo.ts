import type { SubstitutionProduct } from '@store/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { inventoryAt } from '../../db/available.ts';
import type { db, Tx } from '../../db/client.ts';
import { inventory, productImages, productVariants, products } from '../../db/schema/index.ts';
import { hasPriceIn, priceIn } from '../i18n/prices.ts';

type Db = typeof db | Tx;

// One sellable variant with everything the matching rules and the lists need. `available` is stock
// minus reserved AT THE GIVEN STORE (the order's, never the browsing one).
export interface Candidate extends SubstitutionProduct {
  productSlug: string;
  productName: string;
  variantName: string;
  soldByWeight: boolean;
  pricePerKgCents: number | null;
  nominalGrams: number | null;
}

const isFoodSql = sql<boolean>`(${products.shelfLifeDays} is not null or ${products.nutrition} is not null or ${products.ingredients} is not null)`;

function columns(currency: string) {
  return {
    variantId: productVariants.id,
    productId: products.id,
    categoryId: products.categoryId,
    priceCents: sql<number>`${priceIn(currency)}`,
    allergens: products.allergens,
    dietary: products.dietary,
    isFood: isFoodSql,
    available: sql<number>`greatest(coalesce(${inventory.quantity} - ${inventory.reserved}, 0), 0)::int`,
    productSlug: products.slug,
    productName: products.name,
    variantName: productVariants.name,
    soldByWeight: productVariants.soldByWeight,
    pricePerKgCents: productVariants.pricePerKgCents,
    nominalGrams: productVariants.nominalGrams,
  };
}

const sellable = (currency: string) =>
  and(
    eq(productVariants.status, 'active'),
    eq(products.status, 'active'),
    eq(productVariants.isTrial, false),
    hasPriceIn(currency),
    // A kit has no stock row of its own; it is never a substitute.
    sql`not exists (select 1 from bundle_items where bundle_variant_id = ${productVariants.id})`,
  );

export async function findCandidate(
  run: Db,
  variantId: string,
  storeId: string,
  currency: string,
): Promise<Candidate | undefined> {
  const [row] = await run
    .select(columns(currency))
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, inventoryAt(productVariants.id, storeId))
    .where(and(eq(productVariants.id, variantId), sellable(currency)));
  return row;
}

/** Every sellable variant of one (sub)category at a store: the pool the matches are cut from. */
export async function candidatesInCategory(
  run: Db,
  categoryId: string,
  storeId: string,
  currency: string,
): Promise<Candidate[]> {
  return run
    .select(columns(currency))
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, inventoryAt(productVariants.id, storeId))
    .where(and(eq(products.categoryId, categoryId), sellable(currency)))
    .orderBy(asc(productVariants.id));
}

export async function imagesOf(
  run: Db,
  productIds: string[],
): Promise<Map<string, { url: string; alt: string }>> {
  const out = new Map<string, { url: string; alt: string }>();
  if (productIds.length === 0) return out;
  const rows = await run
    .select({ productId: productImages.productId, url: productImages.url, alt: productImages.alt })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sortOrder), asc(productImages.id));
  for (const r of rows) if (!out.has(r.productId)) out.set(r.productId, r);
  return out;
}
