import type { Order } from '@store/shared';

import {
  addressLines,
  escapeHtml,
  itemsTable,
  itemsText,
  paragraph,
  shell,
  type Email,
} from './layout.ts';

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
    ].join('\n'),
  });
  return { subject, text, html };
}
