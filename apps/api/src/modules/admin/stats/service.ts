import type { AdminStats } from '@store/shared';

import * as repo from './repo.ts';

const DAY_MS = 24 * 3600 * 1000;

export async function getStats(now: Date = new Date()): Promise<AdminStats> {
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const [ordersToday, revenue30dCents, lowStockCount, currency] = await Promise.all([
    repo.countOrdersPlacedSince(startOfToday),
    repo.revenueSince(new Date(now.getTime() - 30 * DAY_MS)),
    repo.countLowStock(),
    repo.shopCurrency(),
  ]);
  return { ordersToday, revenue30dCents, currency, lowStockCount };
}
