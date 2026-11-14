import {
  AdminAnalyticsResponseSchema,
  type AdminAnalytics,
  type AnalyticsInterval,
  type AnalyticsReport,
} from '@store/shared';

import { API_BASE, apiFetch } from './client';

export async function fetchAdminAnalytics(
  from: string,
  to: string,
  interval: AnalyticsInterval,
  signal?: AbortSignal,
): Promise<AdminAnalytics> {
  const qs = new URLSearchParams({ from, to, interval });
  return (
    await apiFetch(`/admin/analytics?${qs.toString()}`, {
      schema: AdminAnalyticsResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

// A plain link the browser downloads (the session cookie goes along): the server streams the file
// and names it, so nothing is built in memory here.
export function analyticsCsvUrl(report: AnalyticsReport, from: string, to: string): string {
  const qs = new URLSearchParams({ report, from, to });
  return `${API_BASE}/api/v1/admin/analytics/export.csv?${qs.toString()}`;
}
