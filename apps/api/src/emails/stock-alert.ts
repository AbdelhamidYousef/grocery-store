import { z } from 'zod';

import { escapeHtml, paragraph, PRIMARY, shell, type Email } from './layout.ts';

export const StockAlertPayloadSchema = z.object({
  productName: z.string(),
  variantName: z.string(),
  productUrl: z.string(),
  cancelUrl: z.string(),
});

// Transactional: the customer asked for exactly this mail, once. It carries a cancel link instead
// of a newsletter unsubscribe (it is not marketing and sends nothing else).
export function stockAlert(rawPayload: Record<string, unknown> | null): Email {
  const p = StockAlertPayloadSchema.parse(rawPayload);
  const subject = `Back in stock: ${p.productName}`;
  const text = [
    `Good news: ${p.productName} (${p.variantName}) is back in stock.`,
    '',
    `Take a look: ${p.productUrl}`,
    '',
    'Stock can go quickly, so we cannot hold one for you.',
    '',
    `You asked us for this one email. Not interested any more? ${p.cancelUrl}`,
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: `${p.productName} is back`,
    heading: 'It is back in stock',
    body: [
      paragraph(
        `Good news: <strong>${escapeHtml(p.productName)}</strong> (${escapeHtml(p.variantName)}) is back in stock.`,
      ),
      `<p style="margin:0 0 16px;"><a href="${escapeHtml(p.productUrl)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:8px;">See it in the shop</a></p>`,
      paragraph('Stock can go quickly, so we cannot hold one for you.'),
      paragraph(
        `<span style="font-size:13px;">You asked us for this one email. <a href="${escapeHtml(p.cancelUrl)}">Not interested any more?</a></span>`,
      ),
    ].join('\n'),
  });
  return { subject, text, html };
}
