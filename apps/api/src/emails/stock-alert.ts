import { z } from 'zod';

import type { EmailText } from './i18n/index.ts';
import { button, escapeHtml, htmlOf, paragraph, shell, type Email } from './layout.ts';

export const StockAlertPayloadSchema = z.object({
  productName: z.string(),
  variantName: z.string(),
  productUrl: z.string(),
  cancelUrl: z.string(),
});

// Transactional: the customer asked for exactly this mail, once. It carries a cancel link instead
// of a newsletter unsubscribe (it is not marketing and sends nothing else).
export function stockAlert(rawPayload: Record<string, unknown> | null, x: EmailText): Email {
  const p = StockAlertPayloadSchema.parse(rawPayload);
  const v = { product: p.productName, variant: p.variantName };
  const subject = x.t('stock.subject', v);
  const text = [
    x.t('stock.l1', v),
    '',
    x.t('stock.look', { url: p.productUrl }),
    '',
    x.t('stock.hurry'),
    '',
    `${x.t('stock.once')} ${x.t('stock.cancel')} ${p.cancelUrl}`,
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t('stock.preheader', v),
    heading: x.t('stock.heading'),
    body: [
      paragraph(htmlOf(x, 'stock.l1', v, ['product'])),
      button(p.productUrl, x.t('stock.button')),
      paragraph(escapeHtml(x.t('stock.hurry'))),
      paragraph(
        `<span style="font-size:13px;">${escapeHtml(x.t('stock.once'))} <a href="${escapeHtml(p.cancelUrl)}">${escapeHtml(x.t('stock.cancel'))}</a></span>`,
      ),
    ].join('\n'),
  });
  return { subject, text, html };
}
