import { z } from 'zod';

import { apiFetch } from './client';

// /health is the one endpoint without the { data } envelope (load balancers read it as-is).
export const HealthSchema = z.object({ status: z.string(), db: z.string(), version: z.string() });
export type Health = z.infer<typeof HealthSchema>;

export function fetchHealth(): Promise<Health> {
  return apiFetch('/health', { schema: HealthSchema });
}
