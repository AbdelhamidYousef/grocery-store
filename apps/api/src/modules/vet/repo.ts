import { asc, count, desc, eq } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import { orderVetDetails, orders } from '../../db/schema/index.ts';

type Db = typeof db | Tx;

export type VetDetailsRow = typeof orderVetDetails.$inferSelect;

export async function findVetDetails(run: Db, orderId: string): Promise<VetDetailsRow | undefined> {
  const [row] = await run
    .select()
    .from(orderVetDetails)
    .where(eq(orderVetDetails.orderId, orderId));
  return row;
}

// One row per order. Placing the same cart again (the shopper edited the form) replaces the vet's
// details and starts the decision over; a cart that no longer needs a vet removes the row.
export async function upsertVetDetails(
  tx: Tx,
  orderId: string,
  vet: { vetName: string; clinic: string; vetEmail: string },
): Promise<void> {
  await tx
    .insert(orderVetDetails)
    .values({ orderId, ...vet })
    .onConflictDoUpdate({
      target: orderVetDetails.orderId,
      set: { ...vet, decision: 'pending' },
    });
}

export async function deleteVetDetails(tx: Tx, orderId: string): Promise<void> {
  await tx.delete(orderVetDetails).where(eq(orderVetDetails.orderId, orderId));
}

export async function lockVetDetails(tx: Tx, orderId: string): Promise<VetDetailsRow | undefined> {
  const [row] = await tx
    .select()
    .from(orderVetDetails)
    .where(eq(orderVetDetails.orderId, orderId))
    .for('update');
  return row;
}

export async function decide(
  tx: Tx,
  orderId: string,
  values: Pick<
    typeof orderVetDetails.$inferInsert,
    'decision' | 'decidedBy' | 'decidedAt' | 'reason' | 'confirmationCode'
  >,
): Promise<void> {
  await tx.update(orderVetDetails).set(values).where(eq(orderVetDetails.orderId, orderId));
}

export async function listDecisions(opts: {
  decision: VetDetailsRow['decision'];
  page: number;
  limit: number;
}) {
  const where = eq(orderVetDetails.decision, opts.decision);
  const [rows, totals] = await Promise.all([
    db
      .select({ vet: orderVetDetails, order: orders })
      .from(orderVetDetails)
      .innerJoin(orders, eq(orders.id, orderVetDetails.orderId))
      .where(where)
      // Oldest wait first for the pending queue; finished ones show the latest decision first.
      .orderBy(
        opts.decision === 'pending' ? asc(orders.placedAt) : desc(orderVetDetails.decidedAt),
        asc(orders.id),
      )
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit),
    db.select({ n: count() }).from(orderVetDetails).where(where),
  ]);
  return { rows, total: totals[0]?.n ?? 0 };
}
