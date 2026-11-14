import { z } from 'zod';

import { env } from '../config/env.ts';

import type { EmailText } from './i18n/index.ts';
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
// admin's reject reason is free text. The words come from the customer's language; the amount is in
// the order's own currency (it is in the payload), formatted in the customer's locale.
export function returnUpdate(
  kind: ReturnEmailKind,
  rawPayload: Record<string, unknown> | null,
  x: EmailText,
): Email {
  const p = ReturnEmailPayloadSchema.parse(rawPayload);
  const ref = returnReference(p.returnId);
  const money = x.money(p.refundCents, p.currency);
  const list = p.items.map((i) => `${i.quantity} x ${i.name}`).join(', ');
  const accountUrl = x.url(env.WEB_ORIGIN, `/account/orders/${encodeURIComponent(p.orderNumber)}`);
  const v = { ref, order: p.orderNumber, list, money };

  const copy: Record<ReturnEmailKind, { subject: string; heading: string; lines: string[] }> = {
    return_requested: {
      subject: x.t('return.requested.subject', v),
      heading: x.t('return.requested.heading'),
      lines: [x.t('return.requested.l1', v), x.t('return.requested.l2', v)],
    },
    return_approved: {
      subject: x.t('return.approved.subject', v),
      heading: x.t('return.approved.heading'),
      lines: [
        x.t('return.approved.l1', v),
        x.t('return.approved.l2', v),
        x.t('return.approved.l3'),
      ],
    },
    return_rejected: {
      subject: x.t('return.rejected.subject', v),
      heading: x.t('return.rejected.heading'),
      lines: [
        x.t('return.rejected.l1', v),
        p.rejectReason
          ? x.t('return.rejected.reason', { reason: p.rejectReason })
          : x.t('return.rejected.noReason'),
      ],
    },
    return_received: {
      subject: x.t('return.received.subject', v),
      heading: x.t('return.received.heading'),
      lines: [x.t('return.received.l1', v), x.t('return.received.l2', v)],
    },
    return_refunded: {
      subject: x.t('return.refunded.subject', v),
      heading: x.t('return.refunded.heading'),
      lines: [
        x.t('return.refunded.l1', v),
        p.simulated ? x.t('return.refunded.simulated') : x.t('return.refunded.real'),
      ],
    },
  };
  const c = copy[kind];
  const text = [
    x.t('mail.hello', { name: p.firstName }),
    '',
    ...c.lines.flatMap((l) => [l, '']),
    x.t('mail.orderLine', { url: accountUrl }),
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: c.subject,
    heading: c.heading,
    body: [
      paragraph(escapeHtml(x.t('mail.hello', { name: p.firstName }))),
      ...c.lines.map((l) => paragraph(escapeHtml(l))),
      paragraph(`<a href="${escapeHtml(accountUrl)}">${escapeHtml(x.t('mail.seeOrder'))}</a>`),
    ].join('\n'),
  });
  return { subject: c.subject, text, html };
}
