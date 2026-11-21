import type { Order } from '@store/shared';

import { env } from '../config/env.ts';

import type { EmailText } from './i18n/index.ts';
import {
  addressLines,
  deliveryBlock,
  deliveryLine,
  escapeHtml,
  htmlOf,
  itemsTable,
  itemsText,
  paragraph,
  PRIMARY,
  shell,
  type Email,
} from './layout.ts';

const trackUrl = (number: string, x: EmailText) =>
  x.url(env.WEB_ORIGIN, `/track-order?number=${encodeURIComponent(number)}`);

// What is held on the card (manual capture): up to the authorised amount, and for weighed lines the
// final price comes after weighing. Nothing for an order paid before manual capture.
function heldLine(order: Order, x: EmailText): string | null {
  if (order.authorizedCents === null) return null;
  const amount = x.money(order.authorizedCents, order.totals.currency);
  const weighed = order.items.some((i) => i.pricePerKgCents !== null);
  return x.t(weighed ? 'confirm.heldWeighed' : 'confirm.held', { amount });
}

// Sent once, in the same transaction that marks the order paid (via the outbox).
export function orderConfirmation(order: Order, x: EmailText): Email {
  const address = addressLines(order.shippingAddress);
  const name = order.shippingAddress.fullName;
  const subject = x.t('confirm.subject', { number: order.number });
  const text = [
    x.t('confirm.thanks', { name }),
    '',
    x.t('confirm.paid', { number: order.number }),
    '',
    itemsText(order, x),
    ...(deliveryLine(order, x) ? ['', deliveryLine(order, x)!] : []),
    ...(heldLine(order, x) ? ['', heldLine(order, x)!] : []),
    '',
    x.t('order.shippingTo'),
    ...address,
    '',
    x.t('confirm.willEmail'),
    x.t('confirm.follow', { url: trackUrl(order.number, x) }),
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t('confirm.preheader', { number: order.number }),
    heading: x.t('confirm.heading'),
    body: [
      paragraph(htmlOf(x, 'confirm.intro', { name, number: order.number }, ['number'])),
      itemsTable(order, x),
      deliveryBlock(order, x),
      ...(heldLine(order, x) ? [paragraph(escapeHtml(heldLine(order, x)!))] : []),
      paragraph(
        `<strong>${escapeHtml(x.t('order.shippingTo').replace(/:$/, ''))}</strong><br>${address.map(escapeHtml).join('<br>')}`,
      ),
      paragraph(escapeHtml(x.t('confirm.willEmail'))),
      paragraph(
        `<a href="${escapeHtml(trackUrl(order.number, x))}" style="color:${PRIMARY};font-weight:bold;">${escapeHtml(x.t('confirm.track'))}</a> ${escapeHtml(x.t('confirm.trackNote'))}`,
      ),
    ].join('\n'),
  });
  return { subject, text, html };
}
