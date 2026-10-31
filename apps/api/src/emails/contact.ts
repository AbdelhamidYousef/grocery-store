import { CONTACT_TOPIC_LABELS, ContactTopicSchema } from '@store/shared';
import { z } from 'zod';

import { escapeHtml, paragraph, shell, type Email } from './layout.ts';

export const ContactPayloadSchema = z.object({
  reference: z.string(),
  name: z.string(),
  email: z.string(),
  topic: ContactTopicSchema,
  orderNumber: z.string().nullable(),
  message: z.string(),
});

// To the customer: proof their message arrived, with a copy of what they wrote.
export function contactAck(rawPayload: Record<string, unknown> | null): Email {
  const p = ContactPayloadSchema.parse(rawPayload);
  const subject = `We got your message (${p.reference})`;
  const text = [
    `Hello ${p.name},`,
    '',
    'Thank you for writing to Pawsome. A person will reply to this address, usually within two working days.',
    '',
    `Reference: ${p.reference}`,
    `Topic: ${CONTACT_TOPIC_LABELS[p.topic]}`,
    ...(p.orderNumber ? [`Order: ${p.orderNumber}`] : []),
    '',
    'Your message:',
    p.message,
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: 'We received your message.',
    heading: 'We got your message',
    body: [
      paragraph(
        `Hello ${escapeHtml(p.name)}, thank you for writing to Pawsome. A person will reply to this address, usually within two working days.`,
      ),
      paragraph(
        `Reference: <strong>${escapeHtml(p.reference)}</strong><br>Topic: ${escapeHtml(CONTACT_TOPIC_LABELS[p.topic])}${p.orderNumber ? `<br>Order: ${escapeHtml(p.orderNumber)}` : ''}`,
      ),
      paragraph(
        `<strong>Your message</strong><br>${escapeHtml(p.message).replaceAll('\n', '<br>')}`,
      ),
    ].join('\n'),
  });
  return { subject, text, html };
}

// To the shop: everything needed to answer without opening the admin.
export function contactNotify(rawPayload: Record<string, unknown> | null): Email {
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
  const html = shell({
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
