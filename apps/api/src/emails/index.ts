import type { Order } from '@store/shared';

import { orderConfirmation } from './order-confirmation.ts';
import { orderShipped } from './order-shipped.ts';

export type { Email } from './layout.ts';

// Which emails exist. The outbox stores only the kind and the order id; the content is rendered
// from the order when the email is sent, so a template fix reaches emails still waiting to go out.
export const EMAIL_KINDS = ['order_confirmation', 'order_shipped'] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const renderEmail = (kind: EmailKind, order: Order) =>
  kind === 'order_confirmation' ? orderConfirmation(order) : orderShipped(order);
