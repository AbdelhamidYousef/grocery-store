import type { Order } from '@store/shared';

import type { EmailText } from './i18n/index.ts';
import {
  addressLines,
  escapeHtml,
  htmlOf,
  itemsTable,
  itemsText,
  paragraph,
  shell,
  type Email,
} from './layout.ts';

// Sent once, when the order moves to `shipped`.
export function orderShipped(order: Order, x: EmailText): Email {
  const address = addressLines(order.shippingAddress);
  const name = order.shippingAddress.fullName;
  const subject = x.t('shipped.subject', { number: order.number });
  const text = [
    x.t('shipped.good', { name, number: order.number }),
    '',
    x.t('shipped.method', { method: order.shippingMethod.name }),
    '',
    itemsText(order, x),
    '',
    x.t('order.deliveringTo'),
    ...address,
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t('shipped.preheader', { number: order.number }),
    heading: x.t('shipped.heading'),
    body: [
      paragraph(
        htmlOf(
          x,
          'shipped.intro',
          { name, number: order.number, method: order.shippingMethod.name },
          ['number'],
        ),
      ),
      itemsTable(order, x),
      paragraph(
        `<strong>${escapeHtml(x.t('order.deliveringTo').replace(/:$/, ''))}</strong><br>${address.map(escapeHtml).join('<br>')}`,
      ),
    ].join('\n'),
  });
  return { subject, text, html };
}
