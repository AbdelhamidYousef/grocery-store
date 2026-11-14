import type { OrderStatus } from '@store/shared';

import type { BadgeTone } from '../../components/ui/Badge';
import type { StringKey } from '../../i18n';

// Words for the shopper, not the database enum: the dictionary keys, translated at render.
export const STATUS_KEY: Record<OrderStatus, StringKey> = {
  pending_payment: 'account.status.pending_payment',
  paid: 'account.status.paid',
  processing: 'account.status.processing',
  shipped: 'account.status.shipped',
  delivered: 'account.status.delivered',
  cancelled: 'account.status.cancelled',
  refunded: 'account.status.refunded',
};

export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending_payment: 'neutral',
  paid: 'primary',
  processing: 'primary',
  shipped: 'primary',
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'danger',
};

// A step in the timeline reads as something that happened.
export const TIMELINE_KEY: Record<OrderStatus, StringKey> = {
  pending_payment: 'account.timeline.pending_payment',
  paid: 'account.timeline.paid',
  processing: 'account.timeline.processing',
  shipped: 'account.timeline.shipped',
  delivered: 'account.timeline.delivered',
  cancelled: 'account.timeline.cancelled',
  refunded: 'account.timeline.refunded',
};
