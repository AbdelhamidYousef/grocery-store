import { z } from 'zod';

import type { EmailText } from './i18n/index.ts';
import { button, escapeHtml, paragraph, shell, type Email } from './layout.ts';
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
  // The English label, kept for mails queued before `milestone` existed.
  ageLabel: z.string(),
  // Which milestone (`life_stage_8w` ...): the age is written in the customer's language from it.
  milestone: z.enum(['life_stage_8w', 'life_stage_6m', 'life_stage_12m']).optional(),
  categoryUrl: z.string(),
  unsubscribeUrl: z.string(),
});

export function petBirthday(rawPayload: Record<string, unknown> | null, x: EmailText): Email {
  const p = PetBirthdayPayloadSchema.parse(rawPayload);
  const v = { pet: p.petName, percent: p.percent, code: p.code };
  const subject = x.t('pet.birthday.subject', v);
  const [codeLead = '', codeTail = ''] = x
    .t('pet.birthday.code', { code: '\u0000' })
    .split('\u0000');
  const text = [
    `${x.t('pet.birthday.subject', v)} 🎉`,
    '',
    `${x.t('pet.birthday.treat', v)} ${x.t('pet.birthday.code', v)}`,
    x.tn('pet.birthday.terms', p.days),
    '',
    x.t('pet.birthday.shop', { url: p.shopUrl }),
    '',
    unsubscribeText(p.unsubscribeUrl, x),
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t('pet.birthday.preheader', v),
    heading: x.t('pet.birthday.heading', v),
    body: [
      paragraph(
        `${escapeHtml(x.t('pet.birthday.treat', v))} ${escapeHtml(codeLead)}<strong style="font-size:20px;letter-spacing:1px;">${escapeHtml(p.code)}</strong>${escapeHtml(codeTail)}`,
      ),
      paragraph(escapeHtml(x.tn('pet.birthday.terms', p.days))),
      button(p.shopUrl, x.t('pet.birthday.button')),
      unsubscribeParagraph(p.unsubscribeUrl, x),
    ].join('\n'),
  });
  return { subject, text, html };
}

export function petLifeStage(rawPayload: Record<string, unknown> | null, x: EmailText): Email {
  const p = PetLifeStagePayloadSchema.parse(rawPayload);
  const age = p.milestone ? x.t(`pet.age.${p.milestone}`) : p.ageLabel;
  const v = { pet: p.petName, age };
  const body = x.t(p.species === 'dog' ? 'pet.stage.dog' : 'pet.stage.cat');
  const subject = x.t('pet.stage.subject', v);
  const text = [
    x.t('pet.stage.today', v),
    '',
    body,
    '',
    x.t('pet.stage.see', { url: p.categoryUrl }),
    '',
    unsubscribeText(p.unsubscribeUrl, x),
    '',
    x.t('mail.signoff'),
  ].join('\n');
  const html = shell(x, {
    preheader: x.t(p.species === 'dog' ? 'pet.stage.preheader.dog' : 'pet.stage.preheader.cat'),
    heading: x.t('pet.stage.heading', v),
    body: [
      paragraph(escapeHtml(body)),
      button(p.categoryUrl, x.t('pet.stage.button')),
      unsubscribeParagraph(p.unsubscribeUrl, x),
    ].join('\n'),
  });
  return { subject, text, html };
}
