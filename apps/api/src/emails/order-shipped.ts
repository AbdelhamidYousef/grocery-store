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

// Sent once, when the order moves to `shipped`.
export function orderShipped(order: Order): Email {
  const address = addressLines(order.shippingAddress);
  const subject = `Your Pawsome order ${order.number} is on its way`;
  const text = [
    `Good news, ${order.shippingAddress.fullName}: order ${order.number} has shipped!`,
    '',
    `Shipping method: ${order.shippingMethod.name}`,
    '',
    itemsText(order),
    '',
    'Delivering to:',
    ...address,
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: `Order ${order.number} has shipped.`,
    heading: 'Your order is on its way!',
    body: [
      paragraph(
        `Hi ${escapeHtml(order.shippingAddress.fullName)}, order <strong>${escapeHtml(order.number)}</strong> has shipped with ${escapeHtml(order.shippingMethod.name)} shipping.`,
      ),
      itemsTable(order),
      paragraph(`<strong>Delivering to</strong><br>${address.map(escapeHtml).join('<br>')}`),
    ].join('\n'),
  });
  return { subject, text, html };
}
