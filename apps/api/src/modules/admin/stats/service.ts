import type { AdminStats } from '@store/shared';

import * as repo from './repo.ts';

const DAY_MS = 24 * 3600 * 1000;

// Revenue is one currency at a time (EUR unless asked), never summed across currencies.
export async function getStats(now: Date = new Date(), currency = 'EUR'): Promise<AdminStats> {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const [ordersToday, revenue30dCents, lowStockByStore] = await Promise.all([
    repo.countOrdersPlacedSince(startOfToday),
    repo.revenueSince(new Date(now.getTime() - 30 * DAY_MS), currency),
    repo.countLowStockByStore(),
  ]);
  return {
    ordersToday,
    revenue30dCents,
    currency,
    lowStockCount: lowStockByStore.reduce((n, s) => n + s.count, 0),
    lowStockByStore,
  };
}
