import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import { productVariants, trialRedemptions } from '../../db/schema/index.ts';

type Db = typeof db | Tx;

// Of these variant ids, the ones that are trial sizes.
export async function filterTrialVariants(run: Db, variantIds: string[]): Promise<string[]> {
  if (variantIds.length === 0) return [];
  const rows = await run
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(inArray(productVariants.id, variantIds), eq(productVariants.isTrial, true)));
  return rows.map((r) => r.id);
}

// Of these trial variants, the ones this customer already has a live (unreleased) redemption for.
export async function redeemedVariants(
  run: Db,
  customerKey: string,
  variantIds: string[],
): Promise<string[]> {
  if (variantIds.length === 0) return [];
  const rows = await run
    .select({ id: trialRedemptions.variantId })
    .from(trialRedemptions)
    .where(
      and(
        eq(trialRedemptions.customerKey, customerKey),
        inArray(trialRedemptions.variantId, variantIds),
        isNull(trialRedemptions.releasedAt),
      ),
    );
  return rows.map((r) => r.id);
}

// `ON CONFLICT DO NOTHING`: the payment has already happened, so a rare race that the unique index
// catches must not undo it. The checkout re-check is what normally prevents the second order.
export async function recordRedemptions(
  tx: Tx,
  rows: { customerKey: string; variantId: string; orderId: string }[],
) {
  if (rows.length === 0) return;
  await tx.insert(trialRedemptions).values(rows).onConflictDoNothing();
}

export async function releaseForOrder(tx: Tx, orderId: string) {
  await tx
    .update(trialRedemptions)
    .set({ releasedAt: sql`now()` })
    .where(and(eq(trialRedemptions.orderId, orderId), isNull(trialRedemptions.releasedAt)));
}
