import { z } from 'zod';

import { OrderStatusSchema } from './checkout.ts';
import { DataSchema } from './common.ts';
import { OrderDeliverySchema } from './slots.ts';

// ---------- public order tracking ----------

// Deliberately loose (no order-number pattern, no email format): a malformed pair must get the
// same 404 as a wrong one, so the shape of the answer never tells a stranger what a real order
// number looks like.
export const TrackOrderBodySchema = z.object({
  orderNumber: z.string().trim().min(1).max(40),
  email: z.string().trim().min(1).max(254),
});
export type TrackOrderBody = z.infer<typeof TrackOrderBodySchema>;

export const TrackingTimelineStepSchema = z.object({
  status: OrderStatusSchema,
  label: z.string(),
  at: z.string(),
});

// What a stranger holding the order number and email may see: status, what was bought, and the
// steps so far. No address, no payment data, no totals.
export const TrackedOrderSchema = z.object({
  orderNumber: z.string(),
  status: OrderStatusSchema,
  statusLabel: z.string(),
  placedAt: z.string().nullable(),
  items: z.array(
    z.object({ name: z.string(), variantName: z.string(), quantity: z.number().int().min(1) }),
  ),
  tracking: z.object({ carrier: z.string(), trackingNumber: z.string() }).nullable(),
  // The promised delivery window (no address or money in it); null for orders from before slots.
  delivery: OrderDeliverySchema.nullable(),
  timeline: z.array(TrackingTimelineStepSchema),
});
export type TrackedOrder = z.infer<typeof TrackedOrderSchema>;
export const TrackOrderResponseSchema = DataSchema(TrackedOrderSchema);
