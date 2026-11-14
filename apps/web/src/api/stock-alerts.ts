import { StockAlertResponseSchema, type StockAlertCreate } from '@store/shared';

import { NoContentSchema } from './auth';
import { apiFetch } from './client';

export async function createStockAlert(body: StockAlertCreate): Promise<void> {
  await apiFetch('/stock-alerts', { method: 'POST', body, schema: StockAlertResponseSchema });
}

export async function cancelStockAlert(token: string): Promise<void> {
  await apiFetch(`/stock-alerts/${encodeURIComponent(token)}`, {
    method: 'DELETE',
    schema: NoContentSchema,
  });
}
