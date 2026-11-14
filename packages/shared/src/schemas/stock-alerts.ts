import { z } from 'zod';

import { EmailSchema } from './auth.ts';
import { DataSchema } from './common.ts';

export const STOCK_ALERT_MAX_WAITING = 5;

export const StockAlertCreateSchema = z.object({
  variantId: z.uuid(),
  email: EmailSchema,
});
export type StockAlertCreate = z.input<typeof StockAlertCreateSchema>;

export const StockAlertResponseSchema = DataSchema(z.object({ status: z.literal('waiting') }));
export const StockAlertCancelParamsSchema = z.object({ token: z.string().min(16).max(128) });
