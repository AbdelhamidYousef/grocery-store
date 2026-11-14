import { z } from 'zod';

import { PaginatedSchema, PaginationQuerySchema } from './common.ts';

// ---------- vet approval queue (admin, simulated) ----------

export const VetDecisionSchema = z.enum(['pending', 'approved', 'rejected']);
export type VetDecision = z.infer<typeof VetDecisionSchema>;

export const AdminVetListQuerySchema = PaginationQuerySchema.extend({
  decision: VetDecisionSchema.default('pending'),
});
export type AdminVetListQuery = z.input<typeof AdminVetListQuerySchema>;

export const AdminVetApprovalSchema = z.object({
  orderNumber: z.string(),
  /** The customer's email. */
  email: z.string(),
  orderStatus: z.string(),
  totalCents: z.number().int(),
  currency: z.string().length(3),
  placedAt: z.string().nullable(),
  vetName: z.string(),
  clinic: z.string(),
  vetEmail: z.string(),
  decision: VetDecisionSchema,
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  reason: z.string().nullable(),
  /** The made-up code the simulated vet "confirmation" produced. */
  confirmationCode: z.string().nullable(),
  items: z.array(
    z.object({ productName: z.string(), variantName: z.string(), quantity: z.number() }),
  ),
  /** True when a rejection would refund without a payment provider (demo mode). */
  simulatedMode: z.boolean(),
});
export type AdminVetApproval = z.infer<typeof AdminVetApprovalSchema>;

export const AdminVetListResponseSchema = PaginatedSchema(AdminVetApprovalSchema);
export const AdminVetResponseSchema = z.object({ data: AdminVetApprovalSchema });

export const AdminVetRejectSchema = z.object({
  reason: z.string().trim().min(3, 'Give the customer a reason').max(300),
});
