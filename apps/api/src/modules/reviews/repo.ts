import { and, desc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import {
  orderItems,
  orders,
  productVariants,
  products,
  reviewPhotos,
  reviewVotes,
  reviews,
  users,
  type orderStatus,
} from '../../db/schema/index.ts';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PaidStatus = (typeof orderStatus.enumValues)[number];

export async function findActiveProduct(slug: string) {
  const [row] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, 'active')));
  return row;
}

// The newest order of this user that contains any variant of the product and whose status is in
// the given list (the service passes paid, processing, shipped, delivered: never refunded).
export async function findPaidOrderId(
  userId: string,
  productId: string,
  paidStatuses: PaidStatus[],
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(productVariants.productId, productId),
        inArray(orders.status, paidStatuses),
      ),
    )
    .orderBy(sql`${orders.placedAt} desc nulls last`)
    .limit(1);
  return row?.id;
}

export type NewReview = typeof reviews.$inferInsert;

export async function insertReview(tx: Tx, values: NewReview) {
  const [row] = await tx.insert(reviews).values(values).returning();
  if (!row) throw new Error('insert of review returned no row');
  return row;
}

export async function insertPhotos(tx: Tx, reviewId: string, paths: string[]) {
  await tx
    .insert(reviewPhotos)
    .values(paths.map((path, position) => ({ reviewId, path, position })));
}

// ---------- public reads (approved only) ----------

// The ONE place the public filter lives: every public query starts from it, so a pending or
// rejected review cannot leak through a new endpoint by forgetting a WHERE.
const approvedFor = (productId: string) =>
  and(eq(reviews.productId, productId), eq(reviews.status, 'approved'));

export async function findProductId(slug: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, 'active')));
  return row?.id;
}

export interface ListFilters {
  rating?: number;
  /** Lowercase phrase from a topic chip: the review text must contain it. */
  topic?: string;
}

// `position()` (not LIKE) so a % or _ typed in a topic is just a character, never a wildcard.
const filterConds = (productId: string, f: ListFilters): SQL | undefined =>
  and(
    approvedFor(productId),
    f.rating !== undefined ? eq(reviews.rating, f.rating) : undefined,
    f.topic !== undefined
      ? sql`position(${f.topic} in lower(${reviews.title} || ' ' || ${reviews.body})) > 0`
      : undefined,
  );

const hasPhoto = exists(
  db
    .select({ one: sql`1` })
    .from(reviewPhotos)
    .where(eq(reviewPhotos.reviewId, reviews.id)),
);

export async function listApproved(
  productId: string,
  f: ListFilters,
  sort: 'helpful' | 'newest' | 'photos',
  viewerId: string | null,
  limit: number,
  offset: number,
) {
  const where = filterConds(productId, f);
  const order =
    sort === 'newest'
      ? [desc(reviews.createdAt)]
      : sort === 'photos'
        ? [desc(hasPhoto), desc(reviews.helpfulCount), desc(reviews.createdAt)]
        : [desc(reviews.helpfulCount), desc(reviews.createdAt)];
  const [rows, [count]] = await Promise.all([
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        verifiedBuyer: reviews.verifiedBuyer,
        firstName: users.firstName,
        lastName: users.lastName,
        sizePurchased: reviews.sizePurchased,
        wouldRecommend: reviews.wouldRecommend,
        helpfulCount: reviews.helpfulCount,
        createdAt: reviews.createdAt,
        voted:
          viewerId === null
            ? sql<boolean>`false`
            : sql<boolean>`${exists(
                db
                  .select({ one: sql`1` })
                  .from(reviewVotes)
                  .where(
                    and(eq(reviewVotes.reviewId, reviews.id), eq(reviewVotes.userId, viewerId)),
                  ),
              )}`,
      })
      .from(reviews)
      .leftJoin(users, eq(users.id, reviews.userId))
      .where(where)
      .orderBy(...order, reviews.id)
      .limit(limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(where),
  ]);
  const photos = rows.length
    ? await db
        .select({ id: reviewPhotos.id, reviewId: reviewPhotos.reviewId, path: reviewPhotos.path })
        .from(reviewPhotos)
        .where(
          inArray(
            reviewPhotos.reviewId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(reviewPhotos.position)
    : [];
  return { rows, photos, total: count?.n ?? 0 };
}

// Breakdown, average and "% would recommend" in one pass over the product's approved reviews.
// The percentage is rounded IN SQL so the API never does float arithmetic on a ratio.
export async function summary(productId: string) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sum: sql<number>`coalesce(sum(${reviews.rating}), 0)::int`,
      s1: sql<number>`count(*) filter (where ${reviews.rating} = 1)::int`,
      s2: sql<number>`count(*) filter (where ${reviews.rating} = 2)::int`,
      s3: sql<number>`count(*) filter (where ${reviews.rating} = 3)::int`,
      s4: sql<number>`count(*) filter (where ${reviews.rating} = 4)::int`,
      s5: sql<number>`count(*) filter (where ${reviews.rating} = 5)::int`,
      recommendPercent: sql<
        number | null
      >`round(100.0 * count(*) filter (where ${reviews.wouldRecommend}) / nullif(count(*), 0))::int`,
    })
    .from(reviews)
    .where(approvedFor(productId));
  if (!row) throw new Error('aggregate returned no row');
  return row;
}

export async function approvedTexts(productId: string): Promise<string[]> {
  const rows = await db
    .select({ title: reviews.title, body: reviews.body })
    .from(reviews)
    .where(approvedFor(productId));
  return rows.map((r) => `${r.title}. ${r.body}`);
}

// ---------- helpful votes ----------

export async function findApprovedReview(id: string) {
  const [row] = await db
    .select({ id: reviews.id, userId: reviews.userId })
    .from(reviews)
    .where(and(eq(reviews.id, id), eq(reviews.status, 'approved')));
  return row;
}

// Insert-or-delete in one transaction. `on conflict do nothing returning` tells us atomically
// whether the vote was new, so two parallel clicks cannot both add 1.
export async function toggleVote(reviewId: string, userId: string) {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(reviewVotes)
      .values({ reviewId, userId })
      .onConflictDoNothing()
      .returning({ reviewId: reviewVotes.reviewId });
    const voted = inserted.length > 0;
    if (!voted) {
      await tx
        .delete(reviewVotes)
        .where(and(eq(reviewVotes.reviewId, reviewId), eq(reviewVotes.userId, userId)));
    }
    const [row] = await tx
      .update(reviews)
      .set({
        helpfulCount: voted
          ? sql`${reviews.helpfulCount} + 1`
          : sql`greatest(${reviews.helpfulCount} - 1, 0)`,
      })
      .where(eq(reviews.id, reviewId))
      .returning({ helpfulCount: reviews.helpfulCount });
    return { voted, helpfulCount: row?.helpfulCount ?? 0 };
  });
}

// ---------- moderation ----------

// FOR UPDATE: two moderators acting on the same review at once must queue, otherwise both would
// read "pending" and both add the rating to the aggregate.
export async function lockReview(tx: Tx, id: string) {
  const [row] = await tx
    .select({
      id: reviews.id,
      productId: reviews.productId,
      userId: reviews.userId,
      rating: reviews.rating,
      status: reviews.status,
      rejectReason: reviews.rejectReason,
    })
    .from(reviews)
    .where(eq(reviews.id, id))
    .for('update');
  return row;
}

export async function setStatus(
  tx: Tx,
  id: string,
  status: 'approved' | 'rejected',
  rejectReason: string | null,
) {
  const [row] = await tx
    .update(reviews)
    .set({ status, rejectReason, moderatedAt: new Date() })
    .where(eq(reviews.id, id))
    .returning();
  if (!row) throw new Error('review vanished while locked');
  return row;
}

// +1 / -1 review with its rating. `greatest(..., 0)` is a second line of defence behind the
// table's CHECK: a bug elsewhere must never show a negative average.
export async function adjustAggregate(
  tx: Tx,
  productId: string,
  direction: 1 | -1,
  rating: number,
) {
  await tx
    .update(products)
    .set({
      ratingCount: sql`greatest(${products.ratingCount} + ${direction}, 0)`,
      ratingSum: sql`greatest(${products.ratingSum} + ${direction * rating}, 0)`,
    })
    .where(eq(products.id, productId));
}

export async function photoPathsOf(tx: Tx, reviewId: string): Promise<string[]> {
  const rows = await tx
    .select({ path: reviewPhotos.path })
    .from(reviewPhotos)
    .where(eq(reviewPhotos.reviewId, reviewId));
  return rows.map((r) => r.path);
}

export async function deletePhotoRows(tx: Tx, reviewId: string) {
  await tx.delete(reviewPhotos).where(eq(reviewPhotos.reviewId, reviewId));
}

export async function deleteReviewRow(tx: Tx, id: string) {
  await tx.delete(reviews).where(eq(reviews.id, id));
}

// What the thank-you email needs, read inside the approving transaction.
export async function emailContext(tx: Tx, reviewId: string) {
  const [row] = await tx
    .select({
      email: users.email,
      storeView: users.storeView,
      firstName: users.firstName,
      productName: products.name,
      productSlug: products.slug,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.id, reviewId));
  return row;
}

// ---------- admin list ----------

const adminCols = {
  id: reviews.id,
  productId: reviews.productId,
  productName: products.name,
  productSlug: products.slug,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  rating: reviews.rating,
  title: reviews.title,
  body: reviews.body,
  verifiedBuyer: reviews.verifiedBuyer,
  sizePurchased: reviews.sizePurchased,
  wouldRecommend: reviews.wouldRecommend,
  status: reviews.status,
  rejectReason: reviews.rejectReason,
  createdAt: reviews.createdAt,
  moderatedAt: reviews.moderatedAt,
};

const adminBase = () =>
  db
    .select(adminCols)
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .leftJoin(users, eq(users.id, reviews.userId));

const photosOfReviews = (ids: string[]) =>
  ids.length === 0
    ? Promise.resolve([])
    : db
        .select({ id: reviewPhotos.id, reviewId: reviewPhotos.reviewId, path: reviewPhotos.path })
        .from(reviewPhotos)
        .where(inArray(reviewPhotos.reviewId, ids))
        .orderBy(reviewPhotos.position);

export async function adminList(
  status: 'pending' | 'approved' | 'rejected',
  limit: number,
  offset: number,
) {
  const where = eq(reviews.status, status);
  const [rows, [count]] = await Promise.all([
    adminBase()
      .where(where)
      // Oldest first for the queue: whoever waited longest is looked at first.
      .orderBy(status === 'pending' ? reviews.createdAt : desc(reviews.createdAt), reviews.id)
      .limit(limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(where),
  ]);
  return { rows, photos: await photosOfReviews(rows.map((r) => r.id)), total: count?.n ?? 0 };
}

export async function adminListOne(id: string) {
  const [row] = await adminBase().where(eq(reviews.id, id));
  return row && { row, photos: await photosOfReviews([id]) };
}
