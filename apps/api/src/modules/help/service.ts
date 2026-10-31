import type { HelpHit, HelpTopic } from '@store/shared';

import * as repo from './repo.ts';

// The contract phase 24's agent tool calls unchanged: pure of HTTP (no request, no response), so
// a router, a script and an agent tool can all use it. Empty or missing `q` lists by topic.
export async function searchHelp(q?: string, topic?: HelpTopic): Promise<HelpHit[]> {
  const term = q?.trim();
  return term ? repo.search(term, topic) : repo.listByTopic(topic);
}
