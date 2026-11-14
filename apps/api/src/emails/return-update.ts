import { formatMoney } from '@store/shared';
import { z } from 'zod';

import { env } from '../config/env.ts';

import { escapeHtml, paragraph, shell, type Email } from './layout.ts';

export const RETURN_EMAIL_KINDS = [
  'return_requested',
  'return_approved',
  'return_rejected',
  'return_received',
  'return_refunded',
] as const;
export type ReturnEmailKind = (typeof RETURN_EMAIL_KINDS)[number];

export const ReturnEmailPayloadSchema = z.object({
  firstName: z.string(),
  orderNumber: z.string(),
  returnId: z.string(),
  currency: z.string().length(3),
  refundCents: z.number().int(),
  items: z.array(z.object({ name: z.string(), quantity: z.number().int() })),
  rejectReason: z.string().nullish(),
  simulated: z.boolean().optional(),
});
export type ReturnEmailPayload = z.infer<typeof ReturnEmailPayloadSchema>;

// A short reference the customer can write on the parcel; the full id stays internal.
export const returnReference = (returnId: string): string =>
  `RMA-${returnId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;

// One template per step of the return, rendered from a small payload (so a wording fix reaches
// emails still waiting in the outbox). Names are escaped: they come from the catalogue and the
// admin's reject reason is free text.
export function returnUpdate(
  kind: ReturnEmailKind,
  rawPayload: Record<string, unknown> | null,
): Email {
  const p = ReturnEmailPayloadSchema.parse(rawPayload);
  const ref = returnReference(p.returnId);
  const money = formatMoney(p.refundCents, p.currency);
  const list = p.items.map((i) => `${i.quantity} x ${i.name}`);
  const accountUrl = `${env.WEB_ORIGIN.replace(/\/$/, '')}/account/orders/${encodeURIComponent(p.orderNumber)}`;

  const copy: Record<ReturnEmailKind, { subject: string; heading: string; lines: string[] }> = {
    return_requested: {
      subject: `We got your return request for order ${p.orderNumber}`,
      heading: 'We got your return request',
      lines: [
        `Thanks, we have your request (${ref}) for order ${p.orderNumber}. Someone will look at it soon and email you the next step.`,
        `You asked to return: ${list.join(', ')}.`,
      ],
    },
    return_approved: {
      subject: `Your return ${ref} is approved`,
      heading: 'Your return is approved',
      lines: [
        `Good news: your return ${ref} for order ${p.orderNumber} is approved.`,
        `How to send it back: pack ${list.join(', ')} in the original packaging if you can, write ${ref} on the parcel, and post it to Pawsome Returns, 1 Bone Street, Riga LV-1010 (a made-up address: this is a demo shop).`,
        'When it arrives and we have checked it, we refund you and send another email.',
      ],
    },
    return_rejected: {
      subject: `About your return ${ref}`,
      heading: 'We could not accept this return',
      lines: [
        `We are sorry: we could not accept return ${ref} for order ${p.orderNumber}.`,
        p.rejectReason
          ? `Reason: ${p.rejectReason}`
          : 'Write to us if you would like to know more.',
      ],
    },
    return_received: {
      subject: `We received your return ${ref}`,
      heading: 'Your parcel arrived',
      lines: [
        `Your return ${ref} for order ${p.orderNumber} has arrived: ${list.join(', ')}.`,
        `We are preparing your refund of ${money}. You will get one more email when it is sent.`,
      ],
    },
    return_refunded: {
      subject: `Your refund of ${money} is on its way`,
      heading: 'Your refund is on its way',
      lines: [
        `We refunded ${money} for return ${ref} (order ${p.orderNumber}).`,
        p.simulated
          ? 'This is a demo shop: the refund was simulated and no money moved.'
          : 'It usually shows up on your card within a few days, depending on your bank.',
      ],
    },
  };
  const c = copy[kind];
  const text = [
    `Hello ${p.firstName},`,
    '',
    ...c.lines.flatMap((l) => [l, '']),
    `Order: ${accountUrl}`,
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: c.subject,
    heading: c.heading,
    body: [
      paragraph(`Hello ${escapeHtml(p.firstName)},`),
      ...c.lines.map((l) => paragraph(escapeHtml(l))),
      paragraph(`<a href="${escapeHtml(accountUrl)}">See your order</a>`),
    ].join('\n'),
  });
  return { subject: c.subject, text, html };
}
