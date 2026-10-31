import type { Order } from '@store/shared';
import { z } from 'zod';

import { escapeHtml, paragraph, shell, type Email } from './layout.ts';

export const WithdrawalPayloadSchema = z.object({
  reference: z.string(),
  // ISO timestamp of the request: the moment the law cares about.
  requestedAt: z.string(),
  itemsText: z.string().nullable(),
  reason: z.string().nullable(),
});
export type WithdrawalPayload = z.infer<typeof WithdrawalPayloadSchema>;

const WHEN = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long',
  timeStyle: 'long',
  timeZone: 'UTC',
});

// Acknowledgement of a withdrawal. EU rules ask the trader to confirm receipt on a "durable
// medium" (an email qualifies), so this states what was received and exactly when.
export function withdrawalAck(order: Order, rawPayload: Record<string, unknown> | null): Email {
  const p = WithdrawalPayloadSchema.parse(rawPayload);
  const when = WHEN.format(new Date(p.requestedAt));
  const scope = p.itemsText ?? 'the whole order';
  const subject = `We received your withdrawal for order ${order.number}`;
  const text = [
    `Hello ${order.shippingAddress.fullName},`,
    '',
    `This email confirms that on ${when} we received your statement withdrawing from the contract for order ${order.number}.`,
    '',
    `Reference: ${p.reference}`,
    `Covers: ${scope}`,
    ...(p.reason ? [`Reason you gave: ${p.reason}`] : []),
    '',
    'We will write again with the next steps. Keep this email as your proof.',
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: `Withdrawal for order ${order.number} received.`,
    heading: 'We received your withdrawal',
    body: [
      paragraph(
        `Hello ${escapeHtml(order.shippingAddress.fullName)}, this email confirms that on <strong>${escapeHtml(when)}</strong> we received your statement withdrawing from the contract for order <strong>${escapeHtml(order.number)}</strong>.`,
      ),
      paragraph(
        `Reference: <strong>${escapeHtml(p.reference)}</strong><br>Covers: ${escapeHtml(scope)}${p.reason ? `<br>Reason you gave: ${escapeHtml(p.reason)}` : ''}`,
      ),
      paragraph('We will write again with the next steps. Keep this email as your proof.'),
    ].join('\n'),
  });
  return { subject, text, html };
}
