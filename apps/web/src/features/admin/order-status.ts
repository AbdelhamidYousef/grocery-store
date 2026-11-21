import type { OrderStatus, PaymentStatus } from '@store/shared';

import type { BadgeTone } from '../../components/ui/Badge';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Pending payment',
  paid: 'Payment secured',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

// A paid order whose money was really taken reads "Charged"; the plain label says the card is only held.
export function orderStatusLabel(status: OrderStatus, capturedCents: number | null): string {
  return status === 'paid' && capturedCents !== null ? 'Charged' : ORDER_STATUS_LABEL[status];
}

// The payment row in the admin's own words: "authorized" is a hold, "succeeded" is money taken.
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  requires_payment: 'Waiting for payment',
  processing: 'Processing',
  authorized: 'Held on the card',
  succeeded: 'Charged',
  failed: 'Failed',
  refunded: 'Refunded',
};

// "Delivery (Delivery in your slot)" read twice: the two kinds are named by what they are.
export function deliveryKindLabel(method: { code: string; name: string }): string {
  if (method.code === 'slot') return 'slot';
  if (method.code === 'express') return 'express';
  return method.name;
}

export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending_payment: 'neutral',
  paid: 'primary',
  processing: 'primary',
  shipped: 'success',
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'danger',
};

// What each button says. The wording is the action ("Mark shipped"), not the state it leads to.
export const TRANSITION_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Back to pending payment',
  paid: 'Mark payment secured',
  processing: 'Start processing',
  shipped: 'Mark shipped',
  delivered: 'Mark delivered',
  cancelled: 'Cancel order',
  refunded: 'Refund order',
};

// Moves that cannot be taken back and may move money: they get a confirmation step.
export function isDestructive(to: OrderStatus): boolean {
  return to === 'cancelled' || to === 'refunded';
}

const WHEN = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

// UTC on purpose, and said so: the dashboard's "today" is a UTC day, and two admins in different
// zones must read the same time off the same order.
export function formatWhen(iso: string | null): string {
  if (!iso) return 'Not placed';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${WHEN.format(date)} UTC`;
}

export const stripePaymentUrl = (paymentIntentId: string) =>
  `https://dashboard.stripe.com/test/payments/${encodeURIComponent(paymentIntentId)}`;
