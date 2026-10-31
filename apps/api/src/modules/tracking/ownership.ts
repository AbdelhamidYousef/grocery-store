import { eq, and } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { orders } from '../../db/schema/index.ts';

export type OwnedOrder = typeof orders.$inferSelect;

// Proof of ownership without an account: the order number AND the email it was placed with.
// `orders.email` is citext, so the comparison ignores case ("Ada@X.com" = "ada@x.com") in the
// database itself. A single query answers for both halves, so "unknown number" and "wrong email"
// take the same path and cost the same, and callers turn `undefined` into ONE identical 404.
// Shared by order tracking and the withdrawal form.
export async function findOwnedOrder(
  orderNumber: string,
  email: string,
): Promise<OwnedOrder | undefined> {
  const [row] = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.number, orderNumber.trim().toUpperCase()), eq(orders.email, email.trim())),
    );
  return row;
}
