import { z } from 'zod';

import { DataSchema } from './common.ts';

// ---------- help centre ----------

export const HELP_TOPICS = ['shipping', 'returns', 'payments', 'accounts'] as const;
export const HelpTopicSchema = z.enum(HELP_TOPICS);
export type HelpTopic = z.infer<typeof HelpTopicSchema>;

export const HELP_TOPIC_LABELS: Record<HelpTopic, string> = {
  shipping: 'Shipping',
  returns: 'Returns',
  payments: 'Payments',
  accounts: 'Accounts',
};

// `q` is optional: no query lists the topic (or everything) in the editors' order.
export const HelpQuerySchema = z.object({
  topic: HelpTopicSchema.optional(),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type HelpQuery = z.infer<typeof HelpQuerySchema>;

// Postgres marks the matched words in the snippet with these two private-use characters instead
// of HTML tags, so the answer text can never smuggle markup into the page: the web splits on the
// markers and renders <mark> elements itself (see `splitHighlights`).
export const HIGHLIGHT_START = '';
export const HIGHLIGHT_END = '';

export interface HighlightPart {
  text: string;
  match: boolean;
}

export function splitHighlights(snippet: string): HighlightPart[] {
  const parts: HighlightPart[] = [];
  let match = false;
  let current = '';
  for (const ch of snippet) {
    if (ch === HIGHLIGHT_START || ch === HIGHLIGHT_END) {
      if (current) parts.push({ text: current, match });
      current = '';
      match = ch === HIGHLIGHT_START;
    } else {
      current += ch;
    }
  }
  if (current) parts.push({ text: current, match });
  return parts;
}

export const HelpHitSchema = z.object({
  slug: z.string(),
  topic: HelpTopicSchema,
  question: z.string(),
  answerMd: z.string(),
  // Plain text with highlight markers; null when there was no query to highlight.
  snippet: z.string().nullable(),
});
export type HelpHit = z.infer<typeof HelpHitSchema>;

export const HelpResponseSchema = DataSchema(z.array(HelpHitSchema));
export type HelpResponse = z.infer<typeof HelpResponseSchema>;
