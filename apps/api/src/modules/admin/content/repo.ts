import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { db, type Tx } from '../../../db/client.ts';
import {
  contactMessages,
  guideCategories,
  guideProducts,
  guides,
  helpArticles,
  orders,
  products,
  testimonials,
  withdrawalRequests,
} from '../../../db/schema/index.ts';

// ---------- guides ----------

export const guideColumns = {
  id: guides.id,
  slug: guides.slug,
  title: guides.title,
  summary: guides.summary,
  bodyMd: guides.bodyMd,
  coverUrl: guides.coverUrl,
  status: guides.status,
  publishedAt: guides.publishedAt,
  updatedAt: guides.updatedAt,
  category: guideCategories.name,
};

export async function listGuides() {
  return db
    .select(guideColumns)
    .from(guides)
    .innerJoin(guideCategories, eq(guideCategories.id, guides.categoryId))
    .orderBy(desc(guides.updatedAt), asc(guides.id));
}

export async function findGuide(id: string, run: Pick<Tx, 'select'> = db) {
  const [row] = await run
    .select(guideColumns)
    .from(guides)
    .innerJoin(guideCategories, eq(guideCategories.id, guides.categoryId))
    .where(eq(guides.id, id));
  return row;
}

export async function listGuideProducts(guideId: string, run: Pick<Tx, 'select'> = db) {
  return run
    .select({ id: products.id, slug: products.slug, name: products.name })
    .from(guideProducts)
    .innerJoin(products, eq(products.id, guideProducts.productId))
    .where(eq(guideProducts.guideId, guideId))
    .orderBy(asc(products.name));
}

export async function countProducts(ids: string[], tx: Tx): Promise<number> {
  if (ids.length === 0) return 0;
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(inArray(products.id, ids));
  return row?.n ?? 0;
}

export async function upsertCategory(tx: Tx, slug: string, name: string): Promise<string> {
  const [row] = await tx
    .insert(guideCategories)
    .values({ slug, name })
    // Keep the existing display name: two admins typing "dairy" and "Dairy" must not rename it.
    .onConflictDoUpdate({ target: guideCategories.slug, set: { slug } })
    .returning({ id: guideCategories.id });
  if (!row) throw new Error('category upsert returned no row');
  return row.id;
}

export async function insertGuide(tx: Tx, values: typeof guides.$inferInsert): Promise<string> {
  const [row] = await tx.insert(guides).values(values).returning({ id: guides.id });
  if (!row) throw new Error('guide insert returned no row');
  return row.id;
}

export async function updateGuide(
  tx: Tx,
  id: string,
  values: Partial<typeof guides.$inferInsert>,
): Promise<boolean> {
  const rows = await tx
    .update(guides)
    .set(values)
    .where(eq(guides.id, id))
    .returning({ id: guides.id });
  return rows.length > 0;
}

export async function replaceGuideProducts(tx: Tx, guideId: string, productIds: string[]) {
  await tx.delete(guideProducts).where(eq(guideProducts.guideId, guideId));
  if (productIds.length > 0) {
    await tx.insert(guideProducts).values(productIds.map((productId) => ({ guideId, productId })));
  }
}

export async function deleteGuide(id: string): Promise<boolean> {
  const rows = await db.delete(guides).where(eq(guides.id, id)).returning({ id: guides.id });
  return rows.length > 0;
}

// ---------- help articles ----------

const helpColumns = {
  id: helpArticles.id,
  slug: helpArticles.slug,
  topic: helpArticles.topic,
  question: helpArticles.question,
  answerMd: helpArticles.answerMd,
  status: helpArticles.status,
  sortOrder: helpArticles.sortOrder,
  updatedAt: helpArticles.updatedAt,
};

export const listHelp = () =>
  db
    .select(helpColumns)
    .from(helpArticles)
    .orderBy(asc(helpArticles.topic), asc(helpArticles.sortOrder), asc(helpArticles.id));

export async function insertHelp(values: typeof helpArticles.$inferInsert) {
  const [row] = await db.insert(helpArticles).values(values).returning(helpColumns);
  return row;
}

export async function updateHelp(id: string, values: Partial<typeof helpArticles.$inferInsert>) {
  const [row] = await db
    .update(helpArticles)
    .set(values)
    .where(eq(helpArticles.id, id))
    .returning(helpColumns);
  return row;
}

export async function deleteHelp(id: string): Promise<boolean> {
  const rows = await db
    .delete(helpArticles)
    .where(eq(helpArticles.id, id))
    .returning({ id: helpArticles.id });
  return rows.length > 0;
}

// ---------- testimonials ----------

export const listTestimonials = () =>
  db
    .select()
    .from(testimonials)
    .orderBy(desc(testimonials.isFeatured), asc(testimonials.name), asc(testimonials.id));

export async function insertTestimonial(values: typeof testimonials.$inferInsert) {
  const [row] = await db.insert(testimonials).values(values).returning();
  return row;
}

export async function updateTestimonial(
  id: string,
  values: Partial<typeof testimonials.$inferInsert>,
) {
  const [row] = await db
    .update(testimonials)
    .set(values)
    .where(eq(testimonials.id, id))
    .returning();
  return row;
}

export async function deleteTestimonial(id: string): Promise<boolean> {
  const rows = await db
    .delete(testimonials)
    .where(eq(testimonials.id, id))
    .returning({ id: testimonials.id });
  return rows.length > 0;
}

// ---------- withdrawals ----------

const withdrawalColumns = {
  id: withdrawalRequests.id,
  orderNumber: orders.number,
  email: withdrawalRequests.email,
  itemsText: withdrawalRequests.itemsText,
  reason: withdrawalRequests.reason,
  status: withdrawalRequests.status,
  createdAt: withdrawalRequests.createdAt,
  acknowledgedAt: withdrawalRequests.acknowledgedAt,
};

// Oldest first inside "new": the one waiting longest is the one to answer first.
export const listWithdrawals = () =>
  db
    .select(withdrawalColumns)
    .from(withdrawalRequests)
    .innerJoin(orders, eq(orders.id, withdrawalRequests.orderId))
    .orderBy(
      sql`case ${withdrawalRequests.status} when 'new' then 0 when 'acknowledged' then 1 else 2 end`,
      asc(withdrawalRequests.createdAt),
      asc(withdrawalRequests.id),
    );

export async function updateWithdrawalStatus(id: string, status: 'new' | 'acknowledged' | 'done') {
  const [current] = await db
    .select({ acknowledgedAt: withdrawalRequests.acknowledgedAt })
    .from(withdrawalRequests)
    .where(eq(withdrawalRequests.id, id));
  if (!current) return undefined;
  await db
    .update(withdrawalRequests)
    .set({
      status,
      // First time somebody moves it past `new`; moving back to `new` keeps the original time.
      ...(status !== 'new' && !current.acknowledgedAt && { acknowledgedAt: new Date() }),
    })
    .where(eq(withdrawalRequests.id, id));
  const [row] = await db
    .select(withdrawalColumns)
    .from(withdrawalRequests)
    .innerJoin(orders, eq(orders.id, withdrawalRequests.orderId))
    .where(and(eq(withdrawalRequests.id, id)));
  return row;
}

// ---------- contact messages ----------

export const listContactMessages = () =>
  db
    .select()
    .from(contactMessages)
    .orderBy(
      sql`${contactMessages.handledAt} is not null`,
      desc(contactMessages.createdAt),
      asc(contactMessages.id),
    );

export async function setContactHandled(id: string, handled: boolean) {
  const [row] = await db
    .update(contactMessages)
    .set({ handledAt: handled ? new Date() : null })
    .where(eq(contactMessages.id, id))
    .returning();
  return row;
}
