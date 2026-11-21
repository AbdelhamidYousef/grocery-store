import type { OrderStatus } from '@store/shared';

// ADAPTER (phase 20 <-> phase 14). Phase 14 owns `ORDER_STATUS_LABELS` in @store/shared (and phases
// 22/23 add statuses to it). Until it is merged this file stands in with the same words; after
// the merge, replace the body of `statusLabel` with `ORDER_STATUS_LABELS[status]` and delete the map.
const LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Order received',
  processing: 'Being packed',
  shipped: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const statusLabel = (status: OrderStatus): string => LABELS[status];

// ADAPTER: orders have no carrier or tracking number column yet (phase 22 adds shipments). The
// tracking response already carries the field, so only this function changes then.
export function trackingOf(_order: {
  id: string;
}): { carrier: string; trackingNumber: string } | null {
  return null;
}
