import { z } from 'zod';

import { env } from '../config/env.ts';

import { escapeHtml, paragraph, shell, type Email } from './layout.ts';

export const ReviewApprovedPayloadSchema = z.object({
  firstName: z.string(),
  productName: z.string(),
  productSlug: z.string(),
});

// Sent once when a moderator approves a review (queued in the same transaction as the approval).
export function reviewApproved(rawPayload: Record<string, unknown> | null): Email {
  const p = ReviewApprovedPayloadSchema.parse(rawPayload);
  const url = `${env.WEB_ORIGIN.replace(/\/$/, '')}/products/${encodeURIComponent(p.productSlug)}#reviews`;
  const subject = `Your review of ${p.productName} is live`;
  const text = [
    `Hello ${p.firstName},`,
    '',
    `Thank you for reviewing ${p.productName}! Your review has passed our check and is now on the product page, where it helps other pet owners choose.`,
    `See it here: ${url}`,
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: `Your review of ${p.productName} is live.`,
    heading: 'Thank you for your review!',
    body: [
      paragraph(
        `Hello ${escapeHtml(p.firstName)}, thank you for reviewing <strong>${escapeHtml(p.productName)}</strong>! Your review has passed our check and is now on the product page, where it helps other pet owners choose.`,
      ),
      paragraph(`<a href="${escapeHtml(url)}">See your review</a>`),
    ].join('\n'),
  });
  return { subject, text, html };
}
