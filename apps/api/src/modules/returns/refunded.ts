import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';

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

// Is a return's refund half-done on this order: intent written (money may already have moved at
// the provider) but not yet marked refunded? While it is, the return owns the order's next status,
// so a provider webhook must not move the order on its own.
export async function hasRefundInFlight(tx: Tx, orderId: string): Promise<boolean> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(returns)
    .where(
      and(
        eq(returns.orderId, orderId),
        isNotNull(returns.refundIntentAt),
        ne(returns.status, 'refunded'),
      ),
    );
  return Number(row?.n ?? 0) > 0;
}
