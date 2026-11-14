import {
  bundleAvailable,
  bundleSavingCents,
  isValidBundlePrice,
  type AdminBundle,
  type AdminBundleCreateSchema,
  type AdminBundleUpdateSchema,
} from '@store/shared';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';

import { db, type Tx } from '../../../db/client.ts';
import {
  productImages,
  productSpecs,
  productVariants,
  products,
  priceHistory,
} from '../../../db/schema/index.ts';
import { uniqueViolation } from '../../../lib/db-errors.ts';
import { notFound, validation } from '../../../lib/errors.ts';

import * as repo from './repo.ts';

type CreateInput = z.output<typeof AdminBundleCreateSchema>;
type UpdateInput = z.output<typeof AdminBundleUpdateSchema>;
type Component = { variantId: string; qty: number };

const fieldErrors = (errors: Record<string, string>) =>
  validation({
    formErrors: [],
    fieldErrors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])),
  });

// The rules a kit must satisfy, shared by create and update. Returns the loaded components so the
// caller can use their weight and category.
async function checkKit(
  tx: Tx,
  priceCents: number,
  components: Component[],
  selfVariantId?: string,
) {
  const rows = await repo.listVariantsById(
    tx,
    components.map((c) => c.variantId),
  );
  const byId = new Map(rows.map((r) => [r.variantId, r]));
  const nested = await repo.bundleVariantsAmong(
    tx,
    components.map((c) => c.variantId),
  );
  const errors: Record<string, string> = {};
  components.forEach((c, i) => {
    const row = byId.get(c.variantId);
    const key = `components.${i}.variantId`;
    if (!row) errors[key] = 'This variant does not exist';
    else if (row.status !== 'active' || row.productStatus !== 'active')
      errors[key] = 'This variant is not on sale';
    else if (row.isTrial) errors[key] = 'A sample size cannot be part of a kit';
    else if (nested.has(c.variantId) || row.productKind === 'bundle')
      errors[key] = 'A kit cannot contain another kit';
    else if (c.variantId === selfVariantId) errors[key] = 'A kit cannot contain itself';
  });
  if (Object.keys(errors).length > 0) throw fieldErrors(errors);
  const lines = components.map((c) => ({
    priceCents: byId.get(c.variantId)?.priceCents ?? 0,
    qty: c.qty,
  }));
  const currencies = new Set(rows.map((r) => r.currency));
  if (currencies.size > 1) {
    throw fieldErrors({ components: 'All components must be priced in the same currency' });
  }
  if (!isValidBundlePrice(priceCents, lines)) {
    throw fieldErrors({ priceCents: 'The kit price must be lower than its parts cost separately' });
  }
  return { rows: components.flatMap((c) => byId.get(c.variantId) ?? []), byId };
}

async function toAdminBundles(run: typeof db | Tx, onlyVariantId?: string): Promise<AdminBundle[]> {
  const bundles = await repo.listBundleRows(run, onlyVariantId);
  const items = await repo.listBundleItems(
    run,
    bundles.map((b) => b.variantId),
  );
  const parts = await repo.listVariantsById(run, [
    ...new Set(items.map((i) => i.componentVariantId)),
  ]);
  const partById = new Map(parts.map((p) => [p.variantId, p]));
  return bundles.map((b) => {
    const components = items
      .filter((i) => i.bundleVariantId === b.variantId)
      .flatMap((i) => {
        const p = partById.get(i.componentVariantId);
        return p
          ? [
              {
                variantId: p.variantId,
                productSlug: p.productSlug,
                productName: p.productName,
                variantName: p.name,
                sku: p.sku,
                qty: i.qty,
                priceCents: p.priceCents,
                available: p.available,
              },
            ]
          : [];
      });
    return {
      variantId: b.variantId,
      productId: b.productId,
      slug: b.slug,
      name: b.name,
      priceCents: b.priceCents,
      components,
      ...bundleSavingCents(b.priceCents, components),
      available: bundleAvailable(components),
    };
  });
}

export const listBundles = () => toAdminBundles(db);

export async function getBundle(variantId: string): Promise<AdminBundle> {
  const [bundle] = await toAdminBundles(db, variantId);
  if (!bundle) throw notFound('Bundle not found');
  return bundle;
}

export async function variantOptions(q: string | undefined) {
  const rows = await repo.searchVariants(db, q, 30);
  return rows.map((r) => ({
    variantId: r.variantId,
    label: `${r.productName} (${r.variantName})`,
    sku: r.sku,
    priceCents: r.priceCents,
  }));
}

export async function createBundle(input: CreateInput): Promise<AdminBundle> {
  try {
    const variantId = await db.transaction(async (tx) => {
      const { rows } = await checkKit(tx, input.priceCents, input.components);
      const first = rows[0];
      if (!first) throw fieldErrors({ components: 'A kit needs components' });
      const [product] = await tx
        .insert(products)
        .values({
          slug: input.slug,
          name: input.name,
          description: input.description,
          categoryId: first.categoryId,
          brandId: first.brandId,
          status: 'active',
          kind: 'bundle',
          attributes: first.attributes.pet ? { pet: first.attributes.pet } : {},
        })
        .returning({ id: products.id });
      if (!product) throw new Error('product insert returned no row');
      const weight = input.components.reduce(
        (sum, c) => sum + (rows.find((r) => r.variantId === c.variantId)?.weightGrams ?? 0) * c.qty,
        0,
      );
      const [variant] = await tx
        .insert(productVariants)
        .values({
          productId: product.id,
          sku: `KIT-${input.slug.toUpperCase()}`.slice(0, 60),
          name: 'Kit',
          options: {},
          priceCents: input.priceCents,
          currency: first.currency,
          weightGrams: Math.max(1, weight),
          isDefault: true,
          status: 'active',
        })
        .returning({ id: productVariants.id });
      if (!variant) throw new Error('variant insert returned no row');
      await tx
        .insert(priceHistory)
        .values({ variantId: variant.id, priceCents: input.priceCents, kind: 'base' });
      await repo.replaceItems(tx, variant.id, input.components);
      await tx.insert(productSpecs).values({
        productId: product.id,
        label: 'Contents',
        value: input.components
          .map((c) => {
            const name = rows.find((r) => r.variantId === c.variantId)?.productName ?? '';
            return c.qty > 1 ? `${c.qty} x ${name}` : name;
          })
          .join(', ')
          .slice(0, 200),
        sortOrder: 0,
      });
      // Reuse the first component's photo (no new artwork); the PDP needs one image.
      const image = await repo.firstImageUrl(tx, first.productId);
      if (image) {
        await tx.insert(productImages).values({
          productId: product.id,
          url: image.url,
          alt: input.name,
          width: image.width,
          height: image.height,
          sortOrder: 0,
        });
      }
      return variant.id;
    });
    return await getBundle(variantId);
  } catch (err) {
    const constraint = uniqueViolation(err);
    if (constraint !== undefined) {
      throw fieldErrors(
        constraint.includes('sku') || constraint.includes('slug')
          ? { slug: 'This slug is already used' }
          : { slug: 'Already exists' },
      );
    }
    throw err;
  }
}

export async function updateBundle(variantId: string, input: UpdateInput): Promise<AdminBundle> {
  await db.transaction(async (tx) => {
    const [existing] = await repo.listBundleRows(tx, variantId);
    if (!existing) throw notFound('Bundle not found');
    await repo.lockProduct(tx, existing.productId);
    const { rows } = await checkKit(tx, input.priceCents, input.components, variantId);
    const weight = input.components.reduce(
      (sum, c) => sum + (rows.find((r) => r.variantId === c.variantId)?.weightGrams ?? 0) * c.qty,
      0,
    );
    if (existing.priceCents !== input.priceCents) {
      await tx
        .insert(priceHistory)
        .values({ variantId, priceCents: input.priceCents, kind: 'base' });
    }
    await tx
      .update(productVariants)
      .set({ priceCents: input.priceCents, weightGrams: Math.max(1, weight) })
      .where(eq(productVariants.id, variantId));
    await repo.replaceItems(tx, variantId, input.components);
  });
  return getBundle(variantId);
}

// Archived, not deleted: old orders keep their lines, and `bundle_items` stays so a pending order
// of this kit still releases the right components.
export async function archiveBundle(variantId: string): Promise<{ archived: true }> {
  await db.transaction(async (tx) => {
    const [existing] = await repo.listBundleRows(tx, variantId);
    if (!existing) throw notFound('Bundle not found');
    await tx
      .update(products)
      .set({ status: 'archived' })
      .where(eq(products.id, existing.productId));
    await tx
      .update(productVariants)
      .set({ status: 'archived' })
      .where(eq(productVariants.id, variantId));
  });
  return { archived: true };
}
