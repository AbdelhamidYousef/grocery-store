import type { Order } from '@store/shared';
import { z } from 'zod';

import type { EmailText } from './i18n/index.ts';
import { button, escapeHtml, htmlOf, paragraph, shell, type Email } from './layout.ts';

// "We changed something in your order": sent when the packer records a shortfall. It lists what is
// missing or short (and that nothing is charged for it) and each replacement with signed accept and
// reject links. Replacements nobody answers are kept and charged at dispatch; the mail says so.
const PayloadSchema = z.object({
  links: z.array(z.object({ itemId: z.string(), acceptUrl: z.string(), rejectUrl: z.string() })),
});

export function orderSwaps(order: Order, payload: unknown, x: EmailText): Email {
  const links = new Map(
    (PayloadSchema.safeParse(payload).data?.links ?? []).map((l) => [l.itemId, l]),
  );
  const name = order.shippingAddress.fullName;
  const money = (cents: number) => x.money(cents, order.totals.currency);
  const changed = order.items.filter(
    (i) =>
      i.substitutesItemId === null &&
      (i.pickStatus === 'missing' || i.pickStatus === 'short' || i.pickStatus === 'substituted'),
  );

  const blocks = changed.map((i) => {
    const sub = order.items.find(
      (s) => s.substitutesItemId === i.id && s.swapStatus !== 'rejected',
    );
    const picked = i.pickedQty ?? 0;
    const gap =
      picked === 0
        ? x.t('swaps.missing', { product: i.productName })
        : x.t('swaps.short', { product: i.productName, picked, quantity: i.quantity });
    const swap = sub
      ? x.t('swaps.replacement', {
          product: sub.productName,
          quantity: sub.quantity,
          price: money(sub.unitPriceCents),
          original: money(i.unitPriceCents),
        })
      : x.t('swaps.notCharged');
    const link = sub ? links.get(sub.id) : undefined;
    return { gap, swap, link, sub };
  });

  const subject = x.t('swaps.subject', { number: order.number });
  const text = [
    x.t('swaps.intro', { name, number: order.number }),
    '',
    ...blocks.flatMap((b) => [
      `- ${b.gap}`,
      `  ${b.swap}`,
      ...(b.link
        ? [
            `  ${x.t('swaps.accept')}${x.colon}${b.link.acceptUrl}`,
            `  ${x.t('swaps.reject')}${x.colon}${b.link.rejectUrl}`,
          ]
        : []),
    ]),
    '',
    x.t('swaps.default'),
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t('swaps.preheader', { number: order.number }),
    heading: x.t('swaps.heading'),
    body: [
      paragraph(htmlOf(x, 'swaps.intro', { name, number: order.number }, ['number'])),
      ...blocks.map((b) =>
        [
          paragraph(`<strong>${escapeHtml(b.gap)}</strong><br>${escapeHtml(b.swap)}`),
          ...(b.link
            ? [
                button(b.link.acceptUrl, x.t('swaps.accept')),
                button(b.link.rejectUrl, x.t('swaps.reject')),
              ]
            : []),
        ].join('\n'),
      ),
      paragraph(escapeHtml(x.t('swaps.default'))),
    ].join('\n'),
  });
  return { subject, text, html };
}
