import { and, eq, isNotNull, sql } from 'drizzle-orm';

import type { Tx } from '../../db/client.ts';
import { returns } from '../../db/schema/index.ts';

// Cents already promised or returned through returns on an order: refunded ones, plus any whose
// refund intent was written (money may be on its way). Used to cap further refunds and to size the
// remainder of a whole-order refund.
export async function refundedByReturns(tx: Tx, orderId: string): Promise<number> {
  const [row] = await tx
    .select({ cents: sql<number>`coalesce(sum(${returns.refundCents}), 0)::int` })
    .from(returns)
    .where(and(eq(returns.orderId, orderId), isNotNull(returns.refundIntentAt)));
  return Number(row?.cents ?? 0);
}
