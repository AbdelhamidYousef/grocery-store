import { and, asc, desc, eq, inArray, isNull, lte, gt, or, sql } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import {
  orderItems,
  orders,
  safetyNoticeDeliveries,
  safetyNoticeVariants,
  safetyNotices,
} from '../../db/schema/index.ts';

export type NoticeRow = typeof safetyNotices.$inferSelect;

// "Active" is one rule used by every public read: published, started, not yet ended. An expired
// notice therefore drops off the homepage and the product pages by itself, with no cleanup job.
const active = and(
  eq(safetyNotices.status, 'published'),
  lte(safetyNotices.startsAt, sql`now()`),
  or(isNull(safetyNotices.endsAt), gt(safetyNotices.endsAt, sql`now()`)),
);

// Most severe first (recall, warning, info), then newest.
const bySeverity = sql`case ${safetyNotices.severity} when 'recall' then 0 when 'warning' then 1 else 2 end`;

export async function listActive(): Promise<NoticeRow[]> {
  return db
    .select()
    .from(safetyNotices)
    .where(active)
    .orderBy(bySeverity, desc(safetyNotices.startsAt), asc(safetyNotices.id));
}

export async function listActiveForVariants(variantIds: string[]): Promise<NoticeRow[]> {
  if (variantIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ notice: safetyNotices })
    .from(safetyNotices)
    .innerJoin(safetyNoticeVariants, eq(safetyNoticeVariants.noticeId, safetyNotices.id))
    .where(and(active, inArray(safetyNoticeVariants.variantId, variantIds)));
  return rows
    .map((r) => r.notice)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

const severityRank = (s: NoticeRow['severity']): number =>
  s === 'recall' ? 0 : s === 'warning' ? 1 : 2;

export async function findNotice(id: string): Promise<NoticeRow | undefined> {
  const [row] = await db.select().from(safetyNotices).where(eq(safetyNotices.id, id));
  return row;
}

// Distinct customer emails from orders that were paid for and contain an affected variant.
// Guests count: the email is on the order itself, not on an account. "Paid" excludes orders that
// never completed (pending payment) and cancelled ones.
export async function listBuyerEmails(tx: Tx, noticeId: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ email: orders.email })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(
      safetyNoticeVariants,
      and(
        eq(safetyNoticeVariants.variantId, orderItems.variantId),
        eq(safetyNoticeVariants.noticeId, noticeId),
      ),
    )
    .where(sql`${orders.status} not in ('pending_payment', 'cancelled')`);
  return rows.map((r) => r.email);
}

// Inserts the deliveries that do not exist yet and returns ONLY the new emails: the unique pair
// (notice, email) makes this the idempotency of the whole notify action.
export async function claimDeliveries(
  tx: Tx,
  noticeId: string,
  emails: string[],
): Promise<string[]> {
  if (emails.length === 0) return [];
  const rows = await tx
    .insert(safetyNoticeDeliveries)
    .values(emails.map((email) => ({ noticeId, email })))
    .onConflictDoNothing()
    .returning({ email: safetyNoticeDeliveries.email });
  return rows.map((r) => r.email);
}

export async function countDeliveries(noticeId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(safetyNoticeDeliveries)
    .where(eq(safetyNoticeDeliveries.noticeId, noticeId));
  return row?.n ?? 0;
}
