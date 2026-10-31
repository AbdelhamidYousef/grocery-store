import {
  OrderStatusSchema,
  bestsellerIds,
  deriveBadges,
  isPaidOrLater,
  type Badge,
} from '@store/shared';

import * as repo from './repo.ts';

// Badges are derived from data we hold, for every active product at once, and cached for a minute:
// the bestseller part needs a sales aggregate that does not need to be fresh to the second, and
// there is no job runner to precompute it (one process on a free tier). The list endpoint, the
// badge filter, the badge facet and the homepage bestsellers section all read this one index.
const TTL_MS = 60_000;
const SALES_WINDOW_DAYS = 90;
const PAID_STATUSES = OrderStatusSchema.options.filter(isPaidOrLater);

export type BadgeIndex = ReadonlyMap<string, Badge[]>;

let cache: { at: number; value: BadgeIndex } | null = null;

// Tests share one process and truncate between tests, so the suite clears this before each one.
export function clearBadgeCache(): void {
  cache = null;
}

export async function getBadgeIndex(now = new Date()): Promise<BadgeIndex> {
  if (cache && now.getTime() - cache.at < TTL_MS && now.getTime() >= cache.at) return cache.value;

  const since = new Date(now.getTime() - SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [facts, units] = await Promise.all([
    repo.listBadgeFacts(),
    repo.unitsSoldSince(since, PAID_STATUSES),
  ]);
  const top = bestsellerIds(units, facts.length);
  const value = new Map(
    facts.map((p) => [
      p.id,
      deriveBadges({ ...p, isBestseller: p.isBestsellerOverride || top.has(p.id) }, now),
    ]),
  );
  cache = { at: now.getTime(), value };
  return value;
}
