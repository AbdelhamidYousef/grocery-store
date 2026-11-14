import { asc, eq } from 'drizzle-orm';

import type { db, Tx } from '../../db/client.ts';
import { rewards } from '../../db/schema/index.ts';

type Run = typeof db | Tx;
export type RewardRow = typeof rewards.$inferSelect;
export type RewardWrite = Omit<typeof rewards.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;

export const listRewards = (run: Run, opts: { activeOnly: boolean }) =>
  run
    .select()
    .from(rewards)
    .where(opts.activeOnly ? eq(rewards.active, true) : undefined)
    .orderBy(asc(rewards.costPoints), asc(rewards.name));

export async function findReward(run: Run, id: string): Promise<RewardRow | undefined> {
  const [row] = await run.select().from(rewards).where(eq(rewards.id, id));
  return row;
}

export async function insertReward(run: Run, values: RewardWrite): Promise<RewardRow> {
  const [row] = await run.insert(rewards).values(values).returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function updateReward(
  run: Run,
  id: string,
  values: RewardWrite,
): Promise<RewardRow | undefined> {
  const [row] = await run.update(rewards).set(values).where(eq(rewards.id, id)).returning();
  return row;
}

export async function deleteReward(run: Run, id: string): Promise<boolean> {
  return (
    (await run.delete(rewards).where(eq(rewards.id, id)).returning({ id: rewards.id })).length > 0
  );
}
