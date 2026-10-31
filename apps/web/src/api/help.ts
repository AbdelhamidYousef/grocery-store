import { HelpResponseSchema, type HelpHit, type HelpTopic } from '@store/shared';

import { apiFetch } from './client';

export interface HelpSearchParams {
  q?: string | undefined;
  topic?: HelpTopic | undefined;
}

// The name and shape phase 24's agent tool calls: `searchHelp({ q, topic })`.
export async function searchHelp(
  { q, topic }: HelpSearchParams = {},
  signal?: AbortSignal,
): Promise<HelpHit[]> {
  const search = new URLSearchParams();
  if (q) search.set('q', q);
  if (topic) search.set('topic', topic);
  const text = search.toString();
  return (
    await apiFetch(`/help${text ? `?${text}` : ''}`, {
      schema: HelpResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
