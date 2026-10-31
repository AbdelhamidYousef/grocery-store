import { SafetySeveritySchema } from '@store/shared';
import { z } from 'zod';

import { escapeHtml, paragraph, shell, type Email } from './layout.ts';

export const SafetyNoticePayloadSchema = z.object({
  title: z.string(),
  bodyMd: z.string(),
  severity: SafetySeveritySchema,
});

// To a customer who bought an affected product. The notice text is Markdown; in email it is shown
// as plain paragraphs (escaped), which is readable and cannot carry markup.
export function safetyNotice(rawPayload: Record<string, unknown> | null): Email {
  const p = SafetyNoticePayloadSchema.parse(rawPayload);
  const prefix = p.severity === 'recall' ? 'Product recall: ' : 'Product safety notice: ';
  const subject = `${prefix}${p.title}`;
  const text = [
    p.title,
    '',
    p.bodyMd,
    '',
    'You are receiving this because you bought an affected product from Pawsome.',
    '',
    '- The Pawsome team',
  ].join('\n');
  const html = shell({
    preheader: p.title,
    heading: p.title,
    body: [
      ...p.bodyMd
        .split(/\n{2,}/)
        .map((chunk) => paragraph(escapeHtml(chunk).replaceAll('\n', '<br>'))),
      paragraph('You are receiving this because you bought an affected product from Pawsome.'),
    ].join('\n'),
  });
  return { subject, text, html };
}
