import { and, eq } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import { shippingMethods } from '../../db/schema/index.ts';

type Db = typeof db | Tx;

// `is_active` lets a method be retired without deleting it (old orders snapshot its name and code).
export async function listActiveShippingMethods(run: Db = db) {
  return run.select().from(shippingMethods).where(eq(shippingMethods.isActive, true));
}

export async function findActiveShippingMethod(code: string, run: Db = db) {
  const [row] = await run
    .select()
    .from(shippingMethods)
    .where(and(eq(shippingMethods.code, code), eq(shippingMethods.isActive, true)));
  return row;
}
