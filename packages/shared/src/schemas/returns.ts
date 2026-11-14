import { z } from 'zod';

import { PaginatedSchema, PaginationQuerySchema } from './common.ts';

// ---------- returns (RMA): a sub-process of an order, with its own states ----------

export const ReturnStatusSchema = z.enum([
  'requested',
  'approved',
  'rejected',
  'received',
  'refunded',
]);
export type ReturnStatus = z.infer<typeof ReturnStatusSchema>;

export const ReturnReasonSchema = z.enum([
  'wrong_size',
  'damaged',
  'not_as_described',
  'changed_mind',
  'other',
]);
export type ReturnReason = z.infer<typeof ReturnReasonSchema>;

// Customer wording. Typed as full Records so a new value fails the build until it is written.
export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: 'Return requested',
  approved: 'Return approved',
  rejected: 'Return declined',
  received: 'Return received',
  refunded: 'Refunded',
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  wrong_size: 'Wrong size',
  damaged: 'Arrived damaged',
  not_as_described: 'Not as described',
  changed_mind: 'Changed my mind',
  other: 'Something else',
};

// ---------- money ----------

// What the customer gets back for returning `quantity` units of an order line, in integer cents.
// The base is what they really PAID for the line: price times quantity minus the share of the
// order-level discounts and credits phase 18 stored on the line (`discountCents`). A line is
// refunded by its CUMULATIVE share, `floor(paid * returnedUnits / orderedUnits)`, minus what earlier
// returns already got back. That way the rounding remainder is never lost or invented: when the last
// unit of a line comes back, the line's refunds add up to exactly what was paid.
export function returnLineRefundCents(
  line: { quantity: number; lineTotalCents: number; discountCents: number },
  alreadyReturned: number,
  returning: number,
): number {
  const paid = line.lineTotalCents - line.discountCents;
  const share = (units: number) => Math.floor((paid * units) / line.quantity);
  return share(alreadyReturned + returning) - share(alreadyReturned);
}

// ---------- customer request ----------

const returnNote = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => (v ? v : null));

export const ReturnRequestBodySchema = z.object({
  reason: ReturnReasonSchema,
  note: returnNote,
  items: z
    .array(
      z.object({
        orderItemId: z.uuid(),
        quantity: z.number().int().min(1).max(99),
        // Defaults to the request's reason; a parcel can mix a damaged item and a wrong-size one.
        reason: ReturnReasonSchema.optional(),
      }),
    )
    .min(1, 'Choose at least one item')
    .max(50),
});
export type ReturnRequestBody = z.output<typeof ReturnRequestBodySchema>;

export const ReturnItemSchema = z.object({
  id: z.string(),
  orderItemId: z.string(),
  productName: z.string(),
  variantName: z.string(),
  imageUrl: z.string().nullable(),
  quantity: z.number().int(),
  reason: ReturnReasonSchema,
  refundCents: z.number().int(),
});
export type ReturnItem = z.infer<typeof ReturnItemSchema>;

export const ReturnSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: ReturnStatusSchema,
  reason: ReturnReasonSchema,
  note: z.string().nullable(),
  rejectReason: z.string().nullable(),
  refundCents: z.number().int(),
  refundShipping: z.boolean(),
  /** True when the refund was recorded without a payment provider (demo). */
  simulated: z.boolean(),
  items: z.array(ReturnItemSchema),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  refundedAt: z.string().nullable(),
});
export type CustomerReturn = z.infer<typeof ReturnSchema>;

// What the order page needs to decide whether to show "Return items" and which lines to offer.
export const ReturnEligibilitySchema = z.object({
  eligible: z.boolean(),
  /** Why not, in customer words; null when eligible. */
  reason: z.string().nullable(),
  /** Last day a return can be requested; null until the order is delivered. */
  deadline: z.string().nullable(),
  lines: z.array(
    z.object({
      orderItemId: z.string(),
      returnableQuantity: z.number().int().min(0),
      /** Cents the customer paid for one unit on average (for a refund preview only). */
      paidCents: z.number().int(),
    }),
  ),
});
export type ReturnEligibility = z.infer<typeof ReturnEligibilitySchema>;

export const OrderReturnsSchema = z.object({
  returns: z.array(ReturnSchema),
  eligibility: ReturnEligibilitySchema,
});
export type OrderReturns = z.infer<typeof OrderReturnsSchema>;
export const OrderReturnsResponseSchema = z.object({ data: OrderReturnsSchema });
export const ReturnResponseSchema = z.object({ data: ReturnSchema });

// ---------- admin ----------

export const AdminReturnListQuerySchema = PaginationQuerySchema.extend({
  status: ReturnStatusSchema.optional(),
});
export type AdminReturnListQuery = z.input<typeof AdminReturnListQuerySchema>;

export const AdminReturnRowSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  email: z.string(),
  status: ReturnStatusSchema,
  reason: ReturnReasonSchema,
  itemCount: z.number().int(),
  refundCents: z.number().int(),
  currency: z.string().length(3),
  createdAt: z.string(),
});
export type AdminReturnRow = z.infer<typeof AdminReturnRowSchema>;
export const AdminReturnListResponseSchema = PaginatedSchema(AdminReturnRowSchema);

export const AdminReturnDetailSchema = z.object({
  return: ReturnSchema,
  email: z.string(),
  currency: z.string().length(3),
  orderTotalCents: z.number().int(),
  shippingCents: z.number().int(),
  /** False once another return of this order already got the shipping back. */
  shippingRefundable: z.boolean(),
  /** Units the shelf takes back on `receive` by default (everything not damaged). */
  restockItemIds: z.array(z.string()),
  /** Next states the buttons may offer; the API refuses anything else with 409. */
  allowedNext: z.array(ReturnStatusSchema),
  /** True when a refund would be recorded without a payment provider (demo mode). */
  simulatedMode: z.boolean(),
});
export type AdminReturnDetail = z.infer<typeof AdminReturnDetailSchema>;
export const AdminReturnDetailResponseSchema = z.object({ data: AdminReturnDetailSchema });

export const ReturnIdParamsSchema = z.object({ id: z.uuid() });

export const AdminReturnRejectSchema = z.object({
  reason: z.string().trim().min(3, 'Give the customer a reason').max(300),
});
export const AdminReturnReceiveSchema = z.object({
  // Return-item ids to put back on the shelf; omitted means every line that is not damaged.
  restockItemIds: z.array(z.uuid()).max(50).optional(),
});
export const AdminReturnRefundSchema = z.object({
  refundShipping: z.boolean().default(false),
});
