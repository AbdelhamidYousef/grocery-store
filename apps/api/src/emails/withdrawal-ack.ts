import type { Order } from '@store/shared';
import { z } from 'zod';

import type { EmailText } from './i18n/index.ts';
import { escapeHtml, htmlOf, paragraph, shell, type Email } from './layout.ts';

export const WithdrawalPayloadSchema = z.object({
  reference: z.string(),
  // ISO timestamp of the request: the moment the law cares about.
  requestedAt: z.string(),
  itemsText: z.string().nullable(),
  reason: z.string().nullable(),
});
export type WithdrawalPayload = z.infer<typeof WithdrawalPayloadSchema>;

// Acknowledgement of a withdrawal. EU rules ask the trader to confirm receipt on a "durable
// medium" (an email qualifies), so this states what was received and exactly when.
export function withdrawalAck(
  order: Order,
  rawPayload: Record<string, unknown> | null,
  x: EmailText,
): Email {
  const p = WithdrawalPayloadSchema.parse(rawPayload);
  const when = x.date(p.requestedAt);
  const scope = p.itemsText ?? x.t('withdrawal.wholeOrder');
  const name = order.shippingAddress.fullName;
  const subject = x.t('withdrawal.subject', { number: order.number });
  const text = [
    x.t('mail.hello', { name }),
    '',
    x.t('withdrawal.body', { when, number: order.number }),
    '',
    x.t('withdrawal.reference', { reference: p.reference }),
    x.t('withdrawal.covers', { scope }),
    ...(p.reason ? [x.t('withdrawal.reason', { reason: p.reason })] : []),
    '',
    x.t('withdrawal.next'),
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t('withdrawal.preheader', { number: order.number }),
    heading: x.t('withdrawal.heading'),
    body: [
      paragraph(escapeHtml(x.t('mail.hello', { name }))),
      paragraph(htmlOf(x, 'withdrawal.body', { when, number: order.number }, ['when', 'number'])),
      paragraph(
        [
          htmlOf(x, 'withdrawal.reference', { reference: p.reference }, ['reference']),
          htmlOf(x, 'withdrawal.covers', { scope }),
          ...(p.reason ? [htmlOf(x, 'withdrawal.reason', { reason: p.reason })] : []),
        ].join('<br>'),
      ),
      paragraph(escapeHtml(x.t('withdrawal.next'))),
    ].join('\n'),
  });
  return { subject, text, html };
}
