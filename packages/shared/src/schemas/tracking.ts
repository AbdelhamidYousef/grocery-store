import { z } from 'zod';

import { SwapStatusSchema } from '../substitutions.ts';

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
  // What changed while packing (G7): short or missing items and their replacements. Names and
  // counts only, no money: the answer is given from the email link or the account.
  changes: z.array(
    z.object({
      name: z.string(),
      picked: z.number().int().min(0),
      quantity: z.number().int().min(1),
      replacement: z
        .object({
          name: z.string(),
          quantity: z.number().int().min(1),
          status: SwapStatusSchema,
        })
        .nullable(),
    }),
  ),
  tracking: z.object({ carrier: z.string(), trackingNumber: z.string() }).nullable(),
  // The promised delivery window (no address or money in it); null for orders from before slots.
  delivery: OrderDeliverySchema.nullable(),
  // The back of the shop (G8): the simulated rider. Times only, no address or money; null until the
  // bag is handed over.
  fulfilment: z
    .object({
      riderName: z.string().nullable(),
      packedAt: z.string().nullable(),
      dispatchedAt: z.string().nullable(),
      deliveredAt: z.string().nullable(),
    })
    .nullable(),
  timeline: z.array(TrackingTimelineStepSchema),
});
export type TrackedOrder = z.infer<typeof TrackedOrderSchema>;
export const TrackOrderResponseSchema = DataSchema(TrackedOrderSchema);
