// The products a visitor looked at, newest first, kept in this browser only (nothing about it is
// sent anywhere except the ids the strip asks the catalog about). Ids, not products: the strip
// asks the API for current names and prices. Every storage access is guarded: private windows and
// blocked storage throw, and the shop must work (without the strip) when they do.
const KEY = 'grocery.recently-viewed';
export const RECENTLY_VIEWED_MAX = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readRecentlyViewed(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Whatever is in storage is untrusted (an older build, a hand edit): keep only plausible ids.
    return parsed
      .filter((id): id is string => typeof id === 'string' && UUID.test(id))
      .slice(0, RECENTLY_VIEWED_MAX);
  } catch {
    return [];
  }
}

/** Puts a product first (moving it if it was already there), keeping at most 12. */
export function recordRecentlyViewed(id: string): string[] {
  const next = [id, ...readRecentlyViewed().filter((x) => x !== id)].slice(0, RECENTLY_VIEWED_MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage is full or blocked: the list simply is not remembered.
  }
  return next;
}
