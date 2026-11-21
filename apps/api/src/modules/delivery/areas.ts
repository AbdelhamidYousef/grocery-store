import { DEFAULT_STORE_ID } from '../../db/seed/delivery.ts';

import { loadServedPostcodes, type PostcodeRow } from './repo.ts';

// The postcode table is tiny (about 30 rows) and changes only by seed or migration, so it is read
// once per process and kept. `clearDeliveryCache` is for tests, which truncate the tables.
let cache: Promise<Map<string, PostcodeRow>> | null = null;

function table(): Promise<Map<string, PostcodeRow>> {
  cache ??= loadServedPostcodes().then((rows) => new Map(rows.map((r) => [r.code, r])));
  // A failed load must not be remembered, or one blip would break lookups until a restart.
  cache.catch(() => {
    cache = null;
  });
  return cache;
}

export function clearDeliveryCache(): void {
  cache = null;
}

/** The area and store of a postcode, or undefined when we do not deliver there. */
export async function lookupPostcode(code: string): Promise<PostcodeRow | undefined> {
  return (await table()).get(code);
}

/** What a request without a (served) postcode gets: the central store, flagged as not chosen. */
export const DEFAULT_DELIVERY_STORE_ID = DEFAULT_STORE_ID;

/** Names of the areas we deliver to, for the "we cover ..." sentence of a refusal. */
export async function listAreaNames(): Promise<string[]> {
  const names = new Map<string, string>();
  for (const row of (await table()).values()) names.set(row.areaSlug, row.areaName);
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
