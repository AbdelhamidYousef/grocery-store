import { z } from 'zod';

import { escapeHtml, paragraph, PRIMARY, shell, type Email } from './layout.ts';
import { unsubscribeParagraph, unsubscribeText } from './newsletter.ts';

export const PetBirthdayPayloadSchema = z.object({
  petName: z.string(),
  code: z.string(),
  percent: z.number(),
  days: z.number(),
  shopUrl: z.string(),
  unsubscribeUrl: z.string(),
});

export const PetLifeStagePayloadSchema = z.object({
  petName: z.string(),
  species: z.enum(['dog', 'cat']),
  ageLabel: z.string(),
  categoryUrl: z.string(),
  unsubscribeUrl: z.string(),
});

const button = (href: string, label: string): string =>
  `<p style="margin:0 0 16px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:8px;">${escapeHtml(label)}</a></p>`;

export function petBirthday(rawPayload: Record<string, unknown> | null): Email {
  const p = PetBirthdayPayloadSchema.parse(rawPayload);
  const subject = `Happy birthday, ${p.petName}!`;
  const text = [
    `Happy birthday, ${p.petName}! 🎉`,
    '',
    `A treat from us: ${p.percent}% off, just for you. Code: ${p.code}`,
    `One use, valid for ${p.days} days, and only on your account.`,
    '',
    `Shop: ${p.shopUrl}`,
    '',
    unsubscribeText(p.unsubscribeUrl),
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: `${p.percent}% off for ${p.petName}'s birthday`,
    heading: `Happy birthday, ${p.petName}!`,
    body: [
      paragraph(
        `A treat from us: ${p.percent}% off, just for you. Code: <strong style="font-size:20px;letter-spacing:1px;">${escapeHtml(p.code)}</strong>`,
      ),
      paragraph(`One use, valid for ${p.days} days, and only on your account.`),
      button(p.shopUrl, 'Pick a birthday present'),
      unsubscribeParagraph(p.unsubscribeUrl),
    ].join('\n'),
  });
  return { subject, text, html };
}

export function petLifeStage(rawPayload: Record<string, unknown> | null): Email {
  const p = PetLifeStagePayloadSchema.parse(rawPayload);
  const young = p.species === 'dog' ? 'puppy' : 'kitten';
  const subject = `${p.petName} is ${p.ageLabel} old: time to look at food?`;
  const text = [
    `${p.petName} is ${p.ageLabel} old today.`,
    '',
    `A growing ${young} needs different food as it gets older. It may be time to switch, and your vet can tell you when.`,
    '',
    `See what we have: ${p.categoryUrl}`,
    '',
    unsubscribeText(p.unsubscribeUrl),
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: `Growing ${young}s change what they eat`,
    heading: `${p.petName} is ${p.ageLabel} old`,
    body: [
      paragraph(
        `A growing ${young} needs different food as it gets older. It may be time to switch, and your vet can tell you when.`,
      ),
      button(p.categoryUrl, 'Browse food'),
      unsubscribeParagraph(p.unsubscribeUrl),
    ].join('\n'),
  });
  return { subject, text, html };
}
