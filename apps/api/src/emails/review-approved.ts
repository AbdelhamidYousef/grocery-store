import { z } from 'zod';

import { env } from '../config/env.ts';

import type { EmailText } from './i18n/index.ts';
import { escapeHtml, htmlOf, paragraph, shell, type Email } from './layout.ts';

export const ReviewApprovedPayloadSchema = z.object({
  firstName: z.string(),
  productName: z.string(),
  productSlug: z.string(),
});

// Sent once when a moderator approves a review (queued in the same transaction as the approval).
export function reviewApproved(rawPayload: Record<string, unknown> | null, x: EmailText): Email {
  const p = ReviewApprovedPayloadSchema.parse(rawPayload);
  const url = x.url(env.WEB_ORIGIN, `/products/${encodeURIComponent(p.productSlug)}#reviews`);
  const subject = x.t('review.subject', { product: p.productName });
  const text = [
    x.t('mail.hello', { name: p.firstName }),
    '',
    x.t('review.l1', { product: p.productName }),
    x.t('review.see', { url }),
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t('review.preheader', { product: p.productName }),
    heading: x.t('review.heading'),
    body: [
      paragraph(escapeHtml(x.t('mail.hello', { name: p.firstName }))),
      paragraph(htmlOf(x, 'review.l1', { product: p.productName }, ['product'])),
      paragraph(`<a href="${escapeHtml(url)}">${escapeHtml(x.t('review.link'))}</a>`),
    ].join('\n'),
  });
  return { subject, text, html };
}
