import type { Order } from '@store/shared';

import { env } from '../config/env.ts';

import {
  addressLines,
  escapeHtml,
  itemsTable,
  itemsText,
  paragraph,
  PRIMARY,
  shell,
  type Email,
} from './layout.ts';

const trackUrl = (number: string) =>
  `${env.WEB_ORIGIN.replace(/\/$/, '')}/track-order?number=${encodeURIComponent(number)}`;

// Sent once, in the same transaction that marks the order paid (via the outbox).
export function orderConfirmation(order: Order): Email {
  const address = addressLines(order.shippingAddress);
  const subject = `Your Pawsome order ${order.number} is confirmed`;
  const text = [
    `Thank you for your order, ${order.shippingAddress.fullName}!`,
    '',
    `Order ${order.number} is paid and we are getting it ready.`,
    '',
    itemsText(order),
    '',
    'Shipping to:',
    ...address,
    '',
    "We'll email you again when it ships.",
    `Follow your order any time: ${trackUrl(order.number)}`,
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: `Order ${order.number} is confirmed.`,
    heading: 'Thank you for your order!',
    body: [
      paragraph(
        `Hi ${escapeHtml(order.shippingAddress.fullName)}, order <strong>${escapeHtml(order.number)}</strong> is paid and we are getting it ready.`,
      ),
      itemsTable(order),
      paragraph(`<strong>Shipping to</strong><br>${address.map(escapeHtml).join('<br>')}`),
      paragraph("We'll email you again when it ships."),
      paragraph(
        `<a href="${escapeHtml(trackUrl(order.number))}" style="color:${PRIMARY};font-weight:bold;">Track your order</a> (you will need the email address you ordered with).`,
      ),
    ].join('\n'),
  });
  return { subject, text, html };
}
