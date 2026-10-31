import type { OrderStatus } from './schemas/checkout.ts';

// "Paid or later" is every status except the two where no money is (or stays) with us. Written as
// an exclusion on purpose: statuses added by later phases (returns, partial refunds...) count as
// paid-or-later automatically. Used by the Bestseller badge, trial redemptions and reporting.
const NOT_PAID: readonly OrderStatus[] = ['pending_payment', 'cancelled'];

export function isPaidOrLater(status: OrderStatus): boolean {
  return !NOT_PAID.includes(status);
}

// Customer-facing wording per status. Typed as a full Record so adding a status to the enum fails
// the build until its label is written.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Waiting for payment',
  paid: 'Paid',
  processing: 'Being packed',
  shipped: 'On its way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};
