import {
  AdminPointsAdjustResponseSchema,
  CharityTotalResponseSchema,
  DonatePointsResponseSchema,
  AdminRewardListResponseSchema,
  AdminRewardResponseSchema,
  PersonalCodeListResponseSchema,
  PointsResponseSchema,
  RedeemRewardResponseSchema,
  RewardListResponseSchema,
  type AdminPointsAdjust,
  type AdminReward,
  type CharityTotal,
  type AdminRewardInput,
  type PersonalCode,
  type PointsSummary,
  type RedeemRewardResponse,
  type Reward,
} from '@store/shared';

import { NoContentSchema } from './auth';
import { apiFetch } from './client';

export async function fetchPoints(signal?: AbortSignal): Promise<PointsSummary> {
  return (await apiFetch('/me/points', { schema: PointsResponseSchema, ...(signal && { signal }) }))
    .data;
}

// ---------- rewards shop ----------

export async function fetchRewards(signal?: AbortSignal): Promise<Reward[]> {
  return (
    await apiFetch('/rewards', { schema: RewardListResponseSchema, ...(signal && { signal }) })
  ).data;
}

export async function fetchMyCodes(signal?: AbortSignal): Promise<PersonalCode[]> {
  return (
    await apiFetch('/me/codes', {
      schema: PersonalCodeListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function redeemReward(rewardId: string): Promise<RedeemRewardResponse['data']> {
  return (
    await apiFetch(`/me/rewards/${encodeURIComponent(rewardId)}/redeem`, {
      method: 'POST',
      schema: RedeemRewardResponseSchema,
    })
  ).data;
}

// ---------- admin ----------

export async function fetchAdminRewards(signal?: AbortSignal): Promise<AdminReward[]> {
  return (
    await apiFetch('/admin/rewards', {
      schema: AdminRewardListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function createAdminReward(input: AdminRewardInput): Promise<AdminReward> {
  return (
    await apiFetch('/admin/rewards', {
      method: 'POST',
      body: input,
      schema: AdminRewardResponseSchema,
    })
  ).data;
}

export async function updateAdminReward(id: string, input: AdminRewardInput): Promise<AdminReward> {
  return (
    await apiFetch(`/admin/rewards/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
      schema: AdminRewardResponseSchema,
    })
  ).data;
}

export async function deleteAdminReward(id: string): Promise<void> {
  await apiFetch(`/admin/rewards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    schema: NoContentSchema,
  });
}

export async function adjustPoints(input: AdminPointsAdjust) {
  return (
    await apiFetch('/admin/points/adjust', {
      method: 'POST',
      body: input,
      schema: AdminPointsAdjustResponseSchema,
    })
  ).data;
}

// ---------- charity ----------

export async function fetchCharityTotal(signal?: AbortSignal): Promise<CharityTotal> {
  return (
    await apiFetch('/charity/total', {
      schema: CharityTotalResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function donatePoints(points: number) {
  return (
    await apiFetch('/me/points/donate', {
      method: 'POST',
      body: { points },
      schema: DonatePointsResponseSchema,
    })
  ).data;
}
