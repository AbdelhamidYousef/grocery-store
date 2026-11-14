import type { Order } from '@store/shared';

import { contactAck, contactNotify } from './contact.ts';
import { newsletterConfirm, newsletterWelcome } from './newsletter.ts';
import { orderConfirmation } from './order-confirmation.ts';
import { orderShipped } from './order-shipped.ts';
import { reviewApproved } from './review-approved.ts';
import { safetyNotice } from './safety-notice.ts';
import { withdrawalAck } from './withdrawal-ack.ts';

export type { Email } from './layout.ts';

// Which emails exist. The outbox stores the kind, the order id (when there is one) and a small
// JSON payload; the content is rendered from those when the email is sent, so a template fix
// reaches emails still waiting to go out.
export const ORDER_EMAIL_KINDS = ['order_confirmation', 'order_shipped', 'withdrawal_ack'] as const;
export type OrderEmailKind = (typeof ORDER_EMAIL_KINDS)[number];

// Not about one order: the payload carries everything.
export const GENERAL_EMAIL_KINDS = [
  'contact_ack',
  'contact_notify',
  'safety_notice',
  'review_approved',
  'newsletter_confirm',
  'newsletter_welcome',
] as const;

export const EMAIL_KINDS = [...ORDER_EMAIL_KINDS, ...GENERAL_EMAIL_KINDS] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export type EmailPayload = Record<string, unknown>;

export function renderEmail(
  kind: OrderEmailKind,
  order: Order,
  payload: EmailPayload | null = null,
) {
  switch (kind) {
    case 'order_confirmation':
      return orderConfirmation(order);
    case 'order_shipped':
      return orderShipped(order);
    case 'withdrawal_ack':
      return withdrawalAck(order, payload);
  }
}

export const isOrderEmailKind = (kind: string): kind is OrderEmailKind =>
  (ORDER_EMAIL_KINDS as readonly string[]).includes(kind);

// Entry point for the outbox: an order email needs its order, the others (added by later steps)
// need only their payload.
export function renderQueuedEmail(
  kind: EmailKind,
  order: Order | null,
  payload: EmailPayload | null,
) {
  if (isOrderEmailKind(kind)) {
    if (!order) throw new Error(`email "${kind}" needs an order`);
    return renderEmail(kind, order, payload);
  }
  switch (kind) {
    case 'contact_ack':
      return contactAck(payload);
    case 'contact_notify':
      return contactNotify(payload);
    case 'safety_notice':
      return safetyNotice(payload);
    case 'review_approved':
      return reviewApproved(payload);
    case 'newsletter_confirm':
      return newsletterConfirm(payload);
    case 'newsletter_welcome':
      return newsletterWelcome(payload);
  }
}
