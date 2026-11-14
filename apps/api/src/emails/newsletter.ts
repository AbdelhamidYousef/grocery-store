import { z } from 'zod';

import { escapeHtml, paragraph, PRIMARY, shell, type Email } from './layout.ts';

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

const button = (href: string, label: string): string =>
  `<p style="margin:0 0 16px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:8px;">${escapeHtml(label)}</a></p>`;

/** Every marketing mail ends with this: one click, no login, no questions. */
export const unsubscribeParagraph = (url: string): string =>
  paragraph(
    `<span style="font-size:13px;">You get this because you subscribed to Pawsome news. <a href="${escapeHtml(url)}">Unsubscribe with one click</a>.</span>`,
  );
export const unsubscribeText = (url: string): string =>
  `You get this because you subscribed to Pawsome news. Unsubscribe with one click: ${url}`;

// Step one of double opt-in: nothing is sent to this address until the link is clicked.
export function newsletterConfirm(rawPayload: Record<string, unknown> | null): Email {
  const p = NewsletterConfirmPayloadSchema.parse(rawPayload);
  const subject = 'Confirm your Pawsome subscription';
  const text = [
    'One more step: please confirm that you want Pawsome news, offers and pet tips.',
    '',
    `Confirm: ${p.confirmUrl}`,
    '',
    `The link works for ${p.hours} hours. If you did not ask for this, ignore this email and nothing will be sent to you.`,
    '',
    unsubscribeText(p.unsubscribeUrl),
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: 'Confirm your address to get your welcome code',
    heading: 'Confirm your subscription',
    body: [
      paragraph('One more step: please confirm that you want Pawsome news, offers and pet tips.'),
      button(p.confirmUrl, 'Yes, subscribe me'),
      paragraph(
        `The link works for ${p.hours} hours. If you did not ask for this, ignore this email and nothing will be sent to you.`,
      ),
      unsubscribeParagraph(p.unsubscribeUrl),
    ].join('\n'),
  });
  return { subject, text, html };
}

// Step two: confirmed, here is the welcome code (10%, first order only, single use).
export function newsletterWelcome(rawPayload: Record<string, unknown> | null): Email {
  const p = NewsletterWelcomePayloadSchema.parse(rawPayload);
  const subject = `Welcome to Pawsome: ${p.percent}% off your first order`;
  const text = [
    'You are in. Thank you for subscribing!',
    '',
    `Your welcome code: ${p.code}`,
    `${p.percent}% off your first order, one use, valid for ${p.days} days.`,
    '',
    unsubscribeText(p.unsubscribeUrl),
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: `Your ${p.percent}% welcome code is inside`,
    heading: 'Welcome to the pack',
    body: [
      paragraph('You are in. Thank you for subscribing!'),
      paragraph(
        `Your welcome code: <strong style="font-size:20px;letter-spacing:1px;">${escapeHtml(p.code)}</strong>`,
      ),
      paragraph(
        `${p.percent}% off your first order, one use, valid for ${p.days} days. Enter it in the cart.`,
      ),
      unsubscribeParagraph(p.unsubscribeUrl),
    ].join('\n'),
  });
  return { subject, text, html };
}
