import { z } from 'zod';

import { env } from '../config/env.ts';

import { escapeHtml, paragraph, shell, type Email } from './layout.ts';

export const VET_EMAIL_KINDS = ['vet_held', 'vet_approved', 'vet_rejected'] as const;
export type VetEmailKind = (typeof VET_EMAIL_KINDS)[number];

export const VetEmailPayloadSchema = z.object({
  firstName: z.string(),
  orderNumber: z.string(),
  reason: z.string().nullish(),
  simulated: z.boolean().optional(),
});
export type VetEmailPayload = z.infer<typeof VetEmailPayloadSchema>;

// The three messages of the (simulated) vet check. Demo shop: the text says so, and no vet is ever
// emailed. The reject reason is free text from the admin, so it is escaped in the HTML.
export function vetUpdate(kind: VetEmailKind, rawPayload: Record<string, unknown> | null): Email {
  const p = VetEmailPayloadSchema.parse(rawPayload);
  const url = `${env.WEB_ORIGIN.replace(/\/$/, '')}/account/orders/${encodeURIComponent(p.orderNumber)}`;
  const copy: Record<VetEmailKind, { subject: string; heading: string; lines: string[] }> = {
    vet_held: {
      subject: `Order ${p.orderNumber} is waiting for a vet's okay`,
      heading: "Your order is waiting for a vet's okay",
      lines: [
        `Thank you! Order ${p.orderNumber} includes an item that needs a vet's approval, so we are holding it until that is decided. Your payment is safe and the items are set aside for you.`,
        'We will email you as soon as there is an answer. (Demo shop: no real vet is contacted.)',
      ],
    },
    vet_approved: {
      subject: `Order ${p.orderNumber} is approved and being packed`,
      heading: 'Approved, we are packing it',
      lines: [
        `Good news: the vet check for order ${p.orderNumber} is done and your order is now being packed.`,
      ],
    },
    vet_rejected: {
      subject: `Order ${p.orderNumber} was not approved`,
      heading: 'We could not approve this order',
      lines: [
        `We are sorry: the vet check for order ${p.orderNumber} was not approved, so the order is cancelled and your payment is refunded in full.`,
        p.reason ? `Reason: ${p.reason}` : '',
        p.simulated
          ? 'This is a demo shop: the refund was simulated and no money moved.'
          : 'The refund usually shows up on your card within a few days.',
      ].filter(Boolean),
    },
  };
  const c = copy[kind];
  const text = [
    `Hello ${p.firstName},`,
    '',
    ...c.lines.flatMap((l) => [l, '']),
    `Order: ${url}`,
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: c.subject,
    heading: c.heading,
    body: [
      paragraph(`Hello ${escapeHtml(p.firstName)},`),
      ...c.lines.map((l) => paragraph(escapeHtml(l))),
      paragraph(`<a href="${escapeHtml(url)}">See your order</a>`),
    ].join('\n'),
  });
  return { subject: c.subject, text, html };
}
