import { asc, eq, inArray } from 'drizzle-orm';

import { db, type Tx } from '../../../db/client.ts';
import {
  productFaqs,
  productRelations,
  productSpecs,
  productVariants,
  products,
  variantConstituents,
} from '../../../db/schema/index.ts';

type Run = typeof db | Tx;

export async function findProduct(run: Run, productId: string) {
  const [row] = await run
    .select({
      id: products.id,
      deliveryNote: products.deliveryNote,
    })
    .from(products)
    .where(eq(products.id, productId));
  return row;
}

export async function lockProduct(tx: Tx, productId: string) {
  await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .for('update');
}

export const listSpecs = (run: Run, productId: string) =>
  run
    .select({ label: productSpecs.label, value: productSpecs.value })
    .from(productSpecs)
    .where(eq(productSpecs.productId, productId))
    .orderBy(asc(productSpecs.sortOrder), asc(productSpecs.label));

export const listFaqs = (run: Run, productId: string) =>
  run
    .select({ id: productFaqs.id, question: productFaqs.question, answer: productFaqs.answer })
    .from(productFaqs)
    .where(eq(productFaqs.productId, productId))
    .orderBy(asc(productFaqs.sortOrder), asc(productFaqs.id));

export const listVariantIds = (run: Run, productId: string) =>
  run
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.priceCents), asc(productVariants.name), asc(productVariants.id));

export const listConstituents = (run: Run, variantIds: string[]) =>
  variantIds.length === 0
    ? Promise.resolve([])
    : run
        .select({
          variantId: variantConstituents.variantId,
          key: variantConstituents.key,
          valueBp: variantConstituents.valueBp,
        })
        .from(variantConstituents)
        .where(inArray(variantConstituents.variantId, variantIds));

export async function replaceSpecs(
  tx: Tx,
  productId: string,
  specs: { label: string; value: string }[],
) {
  await tx.delete(productSpecs).where(eq(productSpecs.productId, productId));
  if (specs.length > 0) {
    await tx
      .insert(productSpecs)
      .values(specs.map((s, sortOrder) => ({ productId, ...s, sortOrder })));
  }
}

export async function replaceFaqs(
  tx: Tx,
  productId: string,
  faqs: { question: string; answer: string }[],
) {
  await tx.delete(productFaqs).where(eq(productFaqs.productId, productId));
  if (faqs.length > 0) {
    await tx
      .insert(productFaqs)
      .values(faqs.map((f, sortOrder) => ({ productId, ...f, sortOrder })));
  }
}

export async function replaceConstituents(
  tx: Tx,
  variantId: string,
  values: { key: string; valueBp: number }[],
) {
  await tx.delete(variantConstituents).where(eq(variantConstituents.variantId, variantId));
  if (values.length > 0) {
    await tx.insert(variantConstituents).values(values.map((v) => ({ variantId, ...v })));
  }
}

export async function setProductFields(
  tx: Tx,
  productId: string,
  fields: { deliveryNote?: string | null },
) {
  if (Object.keys(fields).length === 0) return;
  await tx.update(products).set(fields).where(eq(products.id, productId));
}

// ---------- relations ----------

export const listRelations = (run: Run, productId: string) =>
  run
    .select({
      relatedId: productRelations.relatedId,
      relatedName: products.name,
      kind: productRelations.kind,
    })
    .from(productRelations)
    .innerJoin(products, eq(products.id, productRelations.relatedId))
    .where(eq(productRelations.productId, productId))
    .orderBy(asc(productRelations.kind), asc(productRelations.sortOrder));

export async function existingProductIds(run: Run, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await run
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, ids));
  return new Set(rows.map((r) => r.id));
}

export async function replaceRelations(
  tx: Tx,
  productId: string,
  relations: { relatedId: string; kind: 'bought_together' | 'related' }[],
) {
  await tx.delete(productRelations).where(eq(productRelations.productId, productId));
  const next = { bought_together: 0, related: 0 };
  if (relations.length > 0) {
    await tx
      .insert(productRelations)
      .values(relations.map((r) => ({ productId, ...r, sortOrder: next[r.kind]++ })));
  }
}
