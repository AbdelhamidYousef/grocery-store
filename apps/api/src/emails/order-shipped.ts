import { formatClock, formatSlotDate, formatSlotRange, type Order } from '@store/shared';

import type { EmailText } from './i18n/index.ts';
import {
  addressLines,
  deliveryBlock,
  deliveryLine,
  escapeHtml,
  itemsTable,
  itemsText,
  paragraph,
  shell,
  type Email,
} from './layout.ts';

// "On the way, arriving 14:00-15:00": sent once, when the bag is handed to the rider (the order
// moves to `shipped`). The rider is simulated and the mail says so in one line.
function arriving(order: Order, x: EmailText, name: string): string {
  const d = order.delivery;
  if (!d) return x.t('shipped.good', { name, number: order.number });
  if (d.kind === 'express') {
    return x.t('shipped.goodExpress', {
      name,
      number: order.number,
      time: formatClock(new Date(d.to)),
    });
  }
  const from = new Date(d.from);
  return x.t('shipped.goodSlot', {
    name,
    number: order.number,
    when: `${formatSlotDate(from, x.locale)} ${formatSlotRange(from, new Date(d.to))}`,
  });
}

export function orderShipped(order: Order, x: EmailText): Email {
  const address = addressLines(order.shippingAddress);
  const name = order.shippingAddress.fullName;
  const subject = x.t('shipped.subject', { number: order.number });
  const intro = arriving(order, x, name);
  const rider = order.dispatch ? x.t('shipped.rider', { rider: order.dispatch.riderName }) : null;
  const text = [
    intro,
    ...(rider ? ['', rider] : []),
    '',
    itemsText(order, x),
    ...(deliveryLine(order, x) ? ['', deliveryLine(order, x)!] : []),
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
      paragraph(escapeHtml(intro)),
      ...(rider ? [paragraph(escapeHtml(rider))] : []),
      itemsTable(order, x),
      deliveryBlock(order, x),
      paragraph(
        `<strong>${escapeHtml(x.t('order.deliveringTo').replace(/:$/, ''))}</strong><br>${address.map(escapeHtml).join('<br>')}`,
      ),
    ].join('\n'),
  });
  return { subject, text, html };
}
