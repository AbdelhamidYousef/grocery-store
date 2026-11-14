import { randomUUID } from 'node:crypto';

import type {
  AdminReward,
  AdminRewardInput,
  PersonalCode,
  Reward,
  RedeemRewardResponse,
} from '@store/shared';

import { db } from '../../db/client.ts';
import { conflict, notFound } from '../../lib/errors.ts';

import { listPersonalCodes, mintPersonalCode } from './codes.ts';
import * as repo from './repo.ts';
import * as rewardsRepo from './rewards-repo.ts';

// A reward's code lives 60 days (plan 19.4).
export const REWARD_CODE_DAYS = 60;

const toReward = (r: rewardsRepo.RewardRow): Reward => ({
  id: r.id,
  name: r.name,
  description: r.description,
  costPoints: r.costPoints,
  kind: r.kind,
  valueCents: r.valueCents,
});
const toAdmin = (r: rewardsRepo.RewardRow): AdminReward => ({ ...toReward(r), active: r.active });

export async function listPublic(): Promise<Reward[]> {
  return (await rewardsRepo.listRewards(db, { activeOnly: true })).map(toReward);
}

export const toPersonalCode = (
  c: Awaited<ReturnType<typeof listPersonalCodes>>[number],
): PersonalCode => ({
  code: c.code,
  kind: c.kind,
  value: c.value,
  minSpendCents: c.minSpendCents,
  endsAt: c.endsAt?.toISOString() ?? null,
  used: c.used,
});

export async function listMyCodes(userId: string): Promise<PersonalCode[]> {
  return (await listPersonalCodes(db, userId)).map(toPersonalCode);
}

// Spends points on a reward: one transaction that locks the user, checks the balance, writes the
// `redeem` row and mints the code. Either all of it happens or none.
export async function redeem(
  userId: string,
  rewardId: string,
): Promise<RedeemRewardResponse['data']> {
  return db.transaction(async (tx) => {
    const reward = await rewardsRepo.findReward(tx, rewardId);
    if (!reward?.active) throw notFound('That reward is not available');
    await repo.lockUser(tx, userId);
    const { balance } = await repo.standing(tx, userId);
    if (balance < reward.costPoints) {
      throw conflict(
        'CONFLICT',
        `You need ${reward.costPoints} points for this reward and have ${Math.max(0, balance)}`,
      );
    }
    await repo.insertEntry(tx, {
      userId,
      delta: -reward.costPoints,
      kind: 'redeem',
      refKey: `reward:${randomUUID()}`,
      reason: `Reward: ${reward.name}`,
    });
    const row = await mintPersonalCode(tx, {
      userId,
      kind: reward.kind === 'free_shipping' ? 'free_shipping' : 'fixed',
      valueCents: reward.valueCents,
      expiresInDays: REWARD_CODE_DAYS,
      prefix: 'PAWS',
    });
    const after = await repo.standing(tx, userId);
    return {
      code: {
        code: row.code,
        kind: row.kind,
        value: row.value,
        minSpendCents: row.minSpendCents,
        endsAt: row.endsAt?.toISOString() ?? null,
        used: false,
      },
      balance: after.balance,
    };
  });
}

// ---------- admin ----------

const values = (input: AdminRewardInput) => ({
  name: input.name,
  description: input.description ?? '',
  costPoints: input.costPoints,
  kind: input.kind,
  valueCents: input.valueCents,
  active: input.active ?? true,
});

export async function listAdmin(): Promise<AdminReward[]> {
  return (await rewardsRepo.listRewards(db, { activeOnly: false })).map(toAdmin);
}
export async function create(input: AdminRewardInput): Promise<AdminReward> {
  return toAdmin(await rewardsRepo.insertReward(db, values(input)));
}
export async function update(id: string, input: AdminRewardInput): Promise<AdminReward> {
  const row = await rewardsRepo.updateReward(db, id, values(input));
  if (!row) throw notFound('Reward not found');
  return toAdmin(row);
}
// Nothing points at a reward (redemptions are ledger rows with a text reason and minted codes), so
// deleting is safe; the codes already minted keep working.
export async function remove(id: string): Promise<void> {
  if (!(await rewardsRepo.deleteReward(db, id))) throw notFound('Reward not found');
}
