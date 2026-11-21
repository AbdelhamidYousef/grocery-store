import type { Order } from '@store/shared';

import type { EmailText } from './i18n/index.ts';
import { escapeHtml, paragraph, shell, type Email } from './layout.ts';

// Sent once, when the simulated ride is over and the order becomes `delivered`.
export function orderDelivered(order: Order, x: EmailText): Email {
  const name = order.shippingAddress.fullName;
  const intro = x.t('delivered.good', { name, number: order.number });
  return {
    subject: x.t('delivered.subject', { number: order.number }),
    text: [intro, '', x.t('delivered.help'), '', x.t('mail.signoff')].join('\n'),
    html: shell(x, {
      preheader: x.t('delivered.preheader', { number: order.number }),
      heading: x.t('delivered.heading'),
      body: [paragraph(escapeHtml(intro)), paragraph(escapeHtml(x.t('delivered.help')))].join('\n'),
    }),
  };
}
