import { z } from 'zod';

import type { EmailText } from './i18n/index.ts';
import { button, escapeHtml, paragraph, shell, type Email } from './layout.ts';

export const NewsletterConfirmPayloadSchema = z.object({
  confirmUrl: z.string(),
  unsubscribeUrl: z.string(),
  hours: z.number(),
});

export const NewsletterWelcomePayloadSchema = z.object({
  code: z.string(),
  percent: z.number(),
  days: z.number(),
  unsubscribeUrl: z.string(),
});

/** Every marketing mail ends with this: one click, no login, no questions. */
export const unsubscribeParagraph = (url: string, x: EmailText): string =>
  paragraph(
    `<span style="font-size:13px;">${escapeHtml(x.t('news.unsub.lead'))} <a href="${escapeHtml(url)}">${escapeHtml(x.t('news.unsub.link'))}</a>.</span>`,
  );
export const unsubscribeText = (url: string, x: EmailText): string =>
  x.t('news.unsub.text', { url });

// Step one of double opt-in: nothing is sent to this address until the link is clicked.
export function newsletterConfirm(rawPayload: Record<string, unknown> | null, x: EmailText): Email {
  const p = NewsletterConfirmPayloadSchema.parse(rawPayload);
  const subject = x.t('news.confirm.subject');
  const text = [
    x.t('news.confirm.l1'),
    '',
    x.t('news.confirm.link', { url: p.confirmUrl }),
    '',
    x.tn('news.confirm.hours', p.hours),
    '',
    unsubscribeText(p.unsubscribeUrl, x),
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t('news.confirm.preheader'),
    heading: x.t('news.confirm.heading'),
    body: [
      paragraph(escapeHtml(x.t('news.confirm.l1'))),
      button(p.confirmUrl, x.t('news.confirm.button')),
      paragraph(escapeHtml(x.tn('news.confirm.hours', p.hours))),
      unsubscribeParagraph(p.unsubscribeUrl, x),
    ].join('\n'),
  });
  return { subject, text, html };
}

// Step two: confirmed, here is the welcome code (10%, first order only, single use).
export function newsletterWelcome(rawPayload: Record<string, unknown> | null, x: EmailText): Email {
  const p = NewsletterWelcomePayloadSchema.parse(rawPayload);
  const subject = x.t('news.welcome.subject', { percent: p.percent });
  const text = [
    x.t('news.welcome.l1'),
    '',
    x.t('news.welcome.code', { code: p.code }),
    x.tn('news.welcome.terms', p.days, { percent: p.percent }),
    '',
    unsubscribeText(p.unsubscribeUrl, x),
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const [codeLead = '', codeTail = ''] = x
    .t('news.welcome.code', { code: '\u0000' })
    .split('\u0000');
  const html = shell(x, {
    preheader: x.t('news.welcome.preheader', { percent: p.percent }),
    heading: x.t('news.welcome.heading'),
    body: [
      paragraph(escapeHtml(x.t('news.welcome.l1'))),
      paragraph(
        `${escapeHtml(codeLead)}<strong style="font-size:20px;letter-spacing:1px;">${escapeHtml(p.code)}</strong>${escapeHtml(codeTail)}`,
      ),
      paragraph(
        `${escapeHtml(x.tn('news.welcome.terms', p.days, { percent: p.percent }))} ${escapeHtml(x.t('news.welcome.enter'))}`,
      ),
      unsubscribeParagraph(p.unsubscribeUrl, x),
    ].join('\n'),
  });
  return { subject, text, html };
}
