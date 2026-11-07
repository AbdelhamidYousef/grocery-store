import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { db, type Tx } from '../../../db/client.ts';
import {
  feedingRows,
  productFaqs,
  productSpecs,
  productVariants,
  products,
  sizeGuides,
  variantConstituents,
} from '../../../db/schema/index.ts';

type Run = typeof db | Tx;

export async function findProduct(run: Run, productId: string) {
  const [row] = await run
    .select({
      id: products.id,
      deliveryNote: products.deliveryNote,
      sizeGuideId: products.sizeGuideId,
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

export const listFeeding = (run: Run, productId: string) =>
  run
    .select({
      petWeightGMin: feedingRows.petWeightGMin,
      petWeightGMax: feedingRows.petWeightGMax,
      dailyG: feedingRows.dailyG,
      lifeStage: feedingRows.lifeStage,
    })
    .from(feedingRows)
    .where(eq(feedingRows.productId, productId))
    .orderBy(asc(feedingRows.lifeStage), asc(feedingRows.petWeightGMin));

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

export async function replaceFeeding(
  tx: Tx,
  productId: string,
  rows: Omit<typeof feedingRows.$inferInsert, 'productId'>[],
) {
  await tx.delete(feedingRows).where(eq(feedingRows.productId, productId));
  if (rows.length > 0) await tx.insert(feedingRows).values(rows.map((r) => ({ ...r, productId })));
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
  fields: { deliveryNote?: string | null; sizeGuideId?: string | null },
) {
  if (Object.keys(fields).length === 0) return;
  await tx.update(products).set(fields).where(eq(products.id, productId));
}

// ---------- size guides ----------

export type SizeGuideRow = typeof sizeGuides.$inferSelect & { productCount: number };

const withCount = () =>
  db
    .select({
      guide: sizeGuides,
      productCount: sql<number>`(select count(*)::int from ${products} p where p.size_guide_id = size_guides.id)`,
    })
    .from(sizeGuides);

export async function listSizeGuides(): Promise<SizeGuideRow[]> {
  const rows = await withCount().orderBy(asc(sizeGuides.title), asc(sizeGuides.id));
  return rows.map((r) => ({ ...r.guide, productCount: r.productCount }));
}

export async function findSizeGuide(run: Run, id: string) {
  const [row] = await run.select().from(sizeGuides).where(eq(sizeGuides.id, id));
  return row;
}

export async function getSizeGuide(id: string): Promise<SizeGuideRow | undefined> {
  const [row] = await withCount().where(eq(sizeGuides.id, id));
  return row && { ...row.guide, productCount: row.productCount };
}

export async function insertSizeGuide(values: typeof sizeGuides.$inferInsert) {
  const [row] = await db.insert(sizeGuides).values(values).returning({ id: sizeGuides.id });
  return row?.id ?? '';
}

export async function updateSizeGuide(id: string, values: Partial<typeof sizeGuides.$inferInsert>) {
  await db.update(sizeGuides).set(values).where(eq(sizeGuides.id, id));
}

export async function deleteSizeGuide(id: string) {
  await db.delete(sizeGuides).where(and(eq(sizeGuides.id, id)));
}
