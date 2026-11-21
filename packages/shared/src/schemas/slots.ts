import { z } from 'zod';

import { DataSchema } from './common.ts';

// Delivery slots (phase G5). Instants travel as ISO strings (UTC); the web formats them in the
// shop's zone (see `slots.ts`).

export const SlotStatusSchema = z.enum(['open', 'full', 'closed']);
export type SlotStatus = z.infer<typeof SlotStatusSchema>;

export const DeliverySlotSchema = z.object({
  id: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  /** Places left (never negative). */
  remaining: z.number().int().min(0),
  status: SlotStatusSchema,
});
export type DeliverySlot = z.infer<typeof DeliverySlotSchema>;

export const SlotDaySchema = z.object({
  /** The shop-zone calendar day, YYYY-MM-DD. */
  date: z.string(),
  slots: z.array(DeliverySlotSchema),
});
export type SlotDay = z.infer<typeof SlotDaySchema>;

export const ExpressAvailabilitySchema = z.object({
  available: z.boolean(),
  reason: z.enum(['closed', 'busy', 'no_postcode']).optional(),
});
export type ExpressAvailability = z.infer<typeof ExpressAvailabilitySchema>;

/** `GET /delivery/slots` */
export const SlotsResponseSchema = DataSchema(
  z.object({
    serverNow: z.string(),
    days: z.array(SlotDaySchema),
    express: ExpressAvailabilitySchema,
  }),
);
export type SlotsResponse = z.infer<typeof SlotsResponseSchema>;

/** `PUT /cart/slot` */
export const PutCartSlotSchema = z.object({ slotId: z.string().uuid() });

/** What the cart carries: the chosen window, and while it is a slot, when the hold runs out. */
export const CartDeliverySchema = z.object({
  kind: z.enum(['slot', 'express']),
  /** The chosen slot (null for express, whose window starts when the order is placed). */
  slot: z.object({ id: z.string().uuid(), startsAt: z.string(), endsAt: z.string() }).nullable(),
  holdExpiresAt: z.string().nullable(),
});
export type CartDelivery = z.infer<typeof CartDeliverySchema>;

/** The window an order was promised, a snapshot (a slot may be deleted later). */
export const OrderDeliverySchema = z.object({
  kind: z.enum(['slot', 'express']),
  from: z.string(),
  to: z.string(),
});
export type OrderDelivery = z.infer<typeof OrderDeliverySchema>;
