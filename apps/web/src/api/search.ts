import { SuggestResponseSchema } from '@store/shared';

import { apiFetch } from './client';

// `signal` is what makes fast typing safe: TanStack Query aborts the request of a term the
// shopper has already typed past, so a slow answer for "ch" can never land after the one for
// "chew".
export async function fetchSuggestions(q: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/search/suggest?q=${encodeURIComponent(q)}`, {
      schema: SuggestResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
