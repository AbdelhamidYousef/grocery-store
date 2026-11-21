import {
  ANALYTICS_MAX_DAYS,
  STORE_TIME_ZONE,
  type AdminAnalytics,
  type AnalyticsInterval,
} from '@store/shared';

import { validation } from '../../../lib/errors.ts';

import * as repo from './repo.ts';

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const rangeError = (message: string) =>
  validation({ formErrors: [], fieldErrors: { range: [message] } });

// `to` defaults to today in the shop's calendar, `from` to 29 days before it (a 30-day window).
// A real calendar date is required ("2026-02-31" parses as a string but is not a day), the range
// may not run backwards, and at most 366 days are allowed so one request cannot scan the history.
export async function resolveRange(input: {
  from?: string | undefined;
  to?: string | undefined;
  currency?: string | undefined;
}) {
  const to = input.to ?? (await repo.todayInStore());
  const from = input.from ?? addDays(to, -29);
  for (const d of [from, to]) {
    if (addDays(d, 0) !== d) throw rangeError(`${d} is not a real date`);
  }
  if (from > to) throw rangeError('The start date is after the end date');
  if (dayNumber(to) - dayNumber(from) + 1 > ANALYTICS_MAX_DAYS) {
    throw rangeError(`Choose at most ${ANALYTICS_MAX_DAYS} days`);
  }
  return { from, to, currency: input.currency ?? 'EUR' };
}

export async function getAnalytics(query: {
  from?: string | undefined;
  to?: string | undefined;
  currency?: string | undefined;
  interval: AnalyticsInterval;
  lowStock: number;
}): Promise<AdminAnalytics> {
  const range = await resolveRange(query);
  const [series, totals, byUnits, byRevenue, low, returns] = await Promise.all([
    repo.revenueSeries(range, query.interval),
    repo.totals(range),
    repo.topProducts(range, 'units', 10),
    repo.topProducts(range, 'revenue', 10),
    repo.lowStock(query.lowStock, 50),
    repo.returnsRate(range),
  ]);
  const product = (r: (typeof byUnits)[number]) => ({
    productId: r.product_id,
    name: r.name,
    units: r.units,
    revenueCents: r.revenue_cents,
  });
  return {
    range: { from: range.from, to: range.to, interval: query.interval, timeZone: STORE_TIME_ZONE },
    currency: range.currency,
    revenue: {
      totalCents: totals.revenue,
      series: series.map((s) => ({
        bucket: s.bucket,
        revenueCents: s.revenue_cents,
        orders: s.orders,
      })),
    },
    orders: totals.orders,
    aovCents: totals.aov,
    topByUnits: byUnits.map(product),
    topByRevenue: byRevenue.map(product),
    lowStock: low.map((r) => ({
      variantId: r.variant_id,
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      variantName: r.variant_name,
      storeSlug: r.store_slug,
      storeName: r.store_name,
      available: r.available,
    })),
    lowStockThreshold: query.lowStock,
    returns: {
      returnedUnits: returns.returned,
      deliveredUnits: returns.delivered,
      rateBp: returns.rateBp,
    },
  };
}
