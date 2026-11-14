import type { OrderStatus } from '@store/shared';

import type { BadgeTone } from '../../components/ui/Badge';

// Words for the shopper, not the database enum.
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  awaiting_vet_approval: 'Waiting for vet approval',
  processing: 'Being packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending_payment: 'neutral',
  paid: 'primary',
  awaiting_vet_approval: 'pet',
  processing: 'primary',
  shipped: 'primary',
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'danger',
};

// A step in the timeline reads as something that happened.
export const TIMELINE_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Order created',
  paid: 'Payment confirmed',
  awaiting_vet_approval: 'Waiting for a vet to approve your order',
  processing: 'We are packing your order',
  shipped: 'On its way to you',
  delivered: 'Delivered',
  cancelled: 'Order cancelled',
  refunded: 'Payment refunded',
};
