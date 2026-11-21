import type { Order } from '@store/shared';

import { contactAck, contactNotify } from './contact.ts';
import { emailText } from './i18n/index.ts';
import { newsletterConfirm, newsletterWelcome } from './newsletter.ts';
import { orderConfirmation } from './order-confirmation.ts';
import { orderFinalBill } from './order-final-bill.ts';
import { orderShipped } from './order-shipped.ts';
import { orderSwaps } from './order-swaps.ts';
import { RETURN_EMAIL_KINDS, returnUpdate } from './return-update.ts';
import { reviewApproved } from './review-approved.ts';
import { safetyNotice } from './safety-notice.ts';
import { stockAlert } from './stock-alert.ts';
import { withdrawalAck } from './withdrawal-ack.ts';

export type { Email } from './layout.ts';

// Which emails exist. The outbox stores the kind, the order id (when there is one) and a small
// JSON payload; the content is rendered from those when the email is sent, so a template fix
// reaches emails still waiting to go out.
export const ORDER_EMAIL_KINDS = [
  'order_confirmation',
  'order_final_bill',
  'order_swaps',
  'order_shipped',
  'withdrawal_ack',
] as const;
export type OrderEmailKind = (typeof ORDER_EMAIL_KINDS)[number];

// Not about one order: the payload carries everything.
export const GENERAL_EMAIL_KINDS = [
  'contact_ack',
  'contact_notify',
  'safety_notice',
  'review_approved',
  'newsletter_confirm',
  'newsletter_welcome',
  'stock_alert',
  ...RETURN_EMAIL_KINDS,
] as const;

export const EMAIL_KINDS = [...ORDER_EMAIL_KINDS, ...GENERAL_EMAIL_KINDS] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export type EmailPayload = Record<string, unknown>;

export function renderEmail(
  kind: OrderEmailKind,
  order: Order,
  payload: EmailPayload | null = null,
  storeView?: string | null,
) {
  const x = emailText(storeView);
  switch (kind) {
    case 'order_confirmation':
      return orderConfirmation(order, x);
    case 'order_final_bill':
      return orderFinalBill(order, x);
    case 'order_swaps':
      return orderSwaps(order, payload, x);
    case 'order_shipped':
      return orderShipped(order, x);
    case 'withdrawal_ack':
      return withdrawalAck(order, payload, x);
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
  storeView?: string | null,
) {
  if (isOrderEmailKind(kind)) {
    if (!order) throw new Error(`email "${kind}" needs an order`);
    return renderEmail(kind, order, payload, storeView);
  }
  const x = emailText(storeView);
  switch (kind) {
    case 'return_requested':
    case 'return_approved':
    case 'return_rejected':
    case 'return_received':
    case 'return_refunded':
      return returnUpdate(kind, payload, x);
    case 'contact_ack':
      return contactAck(payload, x);
    case 'contact_notify':
      return contactNotify(payload, x);
    case 'safety_notice':
      return safetyNotice(payload, x);
    case 'review_approved':
      return reviewApproved(payload, x);
    case 'newsletter_confirm':
      return newsletterConfirm(payload, x);
    case 'newsletter_welcome':
      return newsletterWelcome(payload, x);
    case 'stock_alert':
      return stockAlert(payload, x);
  }
}
