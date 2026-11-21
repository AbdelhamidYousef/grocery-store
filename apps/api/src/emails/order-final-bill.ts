import type { Order } from '@store/shared';

import type { EmailText } from './i18n/index.ts';
import {
  escapeHtml,
  htmlOf,
  itemsTable,
  itemsText,
  paragraph,
  shell,
  type Email,
} from './layout.ts';

// "Your final bill": sent once, when the money is taken (the capture). It says what was charged, which
// weighed lines came out at what, and that the rest of the hold is released.
export function orderFinalBill(order: Order, x: EmailText): Email {
  const name = order.shippingAddress.fullName;
  const money = (cents: number) => x.money(cents, order.totals.currency);
  const charged = order.capturedCents ?? order.totals.totalCents;
  const weighed = order.items.filter((i) => i.weighedGrams !== null && i.finalCents !== null);
  const weighedLines = weighed.map((i) =>
    x.t('bill.weighed', {
      product: i.productName,
      grams: i.weighedGrams ?? 0,
      price: money(i.finalCents ?? 0),
    }),
  );
  const heldLine =
    order.authorizedCents !== null && order.authorizedCents > charged
      ? x.t('bill.held', { amount: money(order.authorizedCents) })
      : null;
  const subject = x.t('bill.subject', { number: order.number });
  const text = [
    x.t('bill.intro', { name, number: order.number, amount: money(charged) }),
    '',
    itemsText(order, x),
    ...(weighedLines.length > 0 ? ['', ...weighedLines] : []),
    '',
    `${x.t('bill.total')}${x.colon}${money(charged)}`,
    ...(heldLine ? [heldLine] : []),
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t('bill.preheader', { number: order.number, amount: money(charged) }),
    heading: x.t('bill.heading'),
    body: [
      paragraph(
        htmlOf(x, 'bill.intro', { name, number: order.number, amount: money(charged) }, [
          'number',
          'amount',
        ]),
      ),
      itemsTable(order, x),
      ...weighedLines.map((l) => paragraph(escapeHtml(l))),
      paragraph(`<strong>${escapeHtml(x.t('bill.total'))}: ${escapeHtml(money(charged))}</strong>`),
      ...(heldLine ? [paragraph(escapeHtml(heldLine))] : []),
    ].join('\n'),
  });
  return { subject, text, html };
}
