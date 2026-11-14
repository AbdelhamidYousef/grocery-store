import { z } from 'zod';

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
