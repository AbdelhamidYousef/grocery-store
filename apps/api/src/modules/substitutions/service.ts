import { bestMatches, type SubstituteOption } from '@store/shared';
import { and, asc, desc, eq } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import { productVariants, products } from '../../db/schema/index.ts';
import { notFound } from '../../lib/errors.ts';
import { currentStore, currentStoreId } from '../i18n/context.ts';
import { resolveSlug } from '../i18n/translations.ts';

import * as repo from './repo.ts';

type Db = typeof db | Tx;

/**
 * The best replacements for one variant at one store, from the pool of its own subcategory. Used by
 * the product page list (the shopper's store), and by the packer and the swap service (the ORDER's
 * store): the rules are the shared, pure `bestMatches`; this only loads the facts.
 */
export async function matchesFor(
  run: Db,
  variantId: string,
  storeId: string,
  currency: string,
  limit?: number,
): Promise<{ original: repo.Candidate; matches: repo.Candidate[] } | undefined> {
  const original = await repo.findCandidate(run, variantId, storeId, currency);
  if (!original) return undefined;
  const pool = await repo.candidatesInCategory(run, original.categoryId, storeId, currency);
  const byId = new Map(pool.map((c) => [c.variantId, c]));
  const matches = bestMatches(original, pool, limit).flatMap((m) => byId.get(m.variantId) ?? []);
  return { original, matches };
}

// `GET /products/:slug/substitutes?variantId=`: the top 5 at the shopper's store, so a "specific"
// choice made from this list is safe by construction.
export async function listSubstitutes(
  slugFromUrl: string,
  variantId: string | undefined,
): Promise<SubstituteOption[]> {
  const slug = await resolveSlug('product', slugFromUrl);
  const [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(products.slug, slug),
        eq(productVariants.status, 'active'),
        ...(variantId ? [eq(productVariants.id, variantId)] : []),
      ),
    )
    .orderBy(desc(productVariants.isDefault), asc(productVariants.id))
    .limit(1);
  if (!variant) throw notFound('Product not found');
  return optionsFor(db, variant.id, currentStoreId(), currentStore().currency);
}

export async function optionsFor(
  run: Db,
  variantId: string,
  storeId: string,
  currency: string,
): Promise<SubstituteOption[]> {
  const found = await matchesFor(run, variantId, storeId, currency);
  if (!found) return [];
  const images = await repo.imagesOf(run, [...new Set(found.matches.map((m) => m.productId))]);
  return found.matches.map((m) => ({
    variantId: m.variantId,
    productSlug: m.productSlug,
    productName: m.productName,
    variantName: m.variantName,
    imageUrl: images.get(m.productId)?.url ?? null,
    imageAlt: images.get(m.productId)?.alt ?? null,
    unitPriceCents: m.priceCents,
  }));
}
