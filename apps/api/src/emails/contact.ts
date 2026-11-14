import { CONTACT_TOPIC_LABELS, ContactTopicSchema } from '@store/shared';
import { z } from 'zod';

import type { EmailText } from './i18n/index.ts';
import { escapeHtml, htmlOf, paragraph, shell, type Email } from './layout.ts';

export const ContactPayloadSchema = z.object({
  reference: z.string(),
  name: z.string(),
  email: z.string(),
  topic: ContactTopicSchema,
  orderNumber: z.string().nullable(),
  message: z.string(),
});

// To the customer: proof their message arrived, with a copy of what they wrote. In the language of
// the store view they wrote from.
export function contactAck(rawPayload: Record<string, unknown> | null, x: EmailText): Email {
  const p = ContactPayloadSchema.parse(rawPayload);
  const topic = x.t(`contact.topic.${p.topic}`);
  const subject = x.t('contact.ack.subject', { reference: p.reference });
  const text = [
    x.t('mail.hello', { name: p.name }),
    '',
    x.t('contact.ack.l1'),
    '',
    x.t('contact.ack.reference', { reference: p.reference }),
    x.t('contact.ack.topic', { topic }),
    ...(p.orderNumber ? [x.t('contact.ack.order', { order: p.orderNumber })] : []),
    '',
    x.t('contact.ack.yourMessage'),
    p.message,
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t('contact.ack.preheader'),
    heading: x.t('contact.ack.heading'),
    body: [
      paragraph(escapeHtml(x.t('mail.hello', { name: p.name }))),
      paragraph(escapeHtml(x.t('contact.ack.l1'))),
      paragraph(
        [
          htmlOf(x, 'contact.ack.reference', { reference: p.reference }, ['reference']),
          htmlOf(x, 'contact.ack.topic', { topic }),
          ...(p.orderNumber ? [htmlOf(x, 'contact.ack.order', { order: p.orderNumber })] : []),
        ].join('<br>'),
      ),
      paragraph(
        `<strong>${escapeHtml(x.t('contact.ack.yourMessage').replace(/\s*:$/, ''))}</strong><br>${escapeHtml(p.message).replaceAll('\n', '<br>')}`,
      ),
    ].join('\n'),
  });
  return { subject, text, html };
}

// To the shop: everything needed to answer without opening the admin. Always English (the team's
// working language), whatever language the customer wrote from.
export function contactNotify(rawPayload: Record<string, unknown> | null, x: EmailText): Email {
  const p = ContactPayloadSchema.parse(rawPayload);
  const subject = `[Contact] ${CONTACT_TOPIC_LABELS[p.topic]} from ${p.name} (${p.reference})`;
  const text = [
    `New contact message ${p.reference}`,
    `From: ${p.name} <${p.email}>`,
    `Topic: ${CONTACT_TOPIC_LABELS[p.topic]}`,
    `Order: ${p.orderNumber ?? 'not given'}`,
    '',
    p.message,
  ].join('\n');
  const html = shell(x, {
    preheader: `${p.name}: ${CONTACT_TOPIC_LABELS[p.topic]}`,
    heading: 'New contact message',
    body: [
      paragraph(
        `<strong>${escapeHtml(p.name)}</strong> &lt;${escapeHtml(p.email)}&gt;<br>Topic: ${escapeHtml(CONTACT_TOPIC_LABELS[p.topic])}<br>Order: ${escapeHtml(p.orderNumber ?? 'not given')}<br>Reference: ${escapeHtml(p.reference)}`,
      ),
      paragraph(escapeHtml(p.message).replaceAll('\n', '<br>')),
    ].join('\n'),
  });
  return { subject, text, html };
}
