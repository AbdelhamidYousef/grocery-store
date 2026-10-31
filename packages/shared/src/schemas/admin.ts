import { z } from 'zod';

import { DataSchema } from './common.ts';

// ---------- dashboard ----------

// Day boundaries are UTC. Revenue counts orders that were paid and are still standing (paid,
// processing, shipped, delivered): cancelled and refunded orders are not revenue.
export const AdminStatsSchema = z.object({
  ordersToday: z.number().int().min(0),
  revenue30dCents: z.number().int().min(0),
  currency: z.string().length(3),
  // Active variants whose available stock (quantity - reserved) is at or below their threshold.
  lowStockCount: z.number().int().min(0),
});
export type AdminStats = z.infer<typeof AdminStatsSchema>;

export const AdminStatsResponseSchema = DataSchema(AdminStatsSchema);
