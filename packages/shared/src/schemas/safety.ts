import { z } from 'zod';

import { DataSchema } from './common.ts';

// ---------- product safety notices (public) ----------

export const SAFETY_SEVERITIES = ['info', 'warning', 'recall'] as const;
export const SafetySeveritySchema = z.enum(SAFETY_SEVERITIES);
export type SafetySeverity = z.infer<typeof SafetySeveritySchema>;

export const SafetyNoticeSchema = z.object({
  id: z.string(),
  title: z.string(),
  bodyMd: z.string(),
  severity: SafetySeveritySchema,
  startsAt: z.string(),
  endsAt: z.string().nullable(),
});
export type SafetyNotice = z.infer<typeof SafetyNoticeSchema>;
export const ActiveSafetyNoticesResponseSchema = DataSchema(z.array(SafetyNoticeSchema));
