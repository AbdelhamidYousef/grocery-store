import { z } from 'zod';

// The last few searches, kept in this browser only. They are never sent anywhere (no endpoint, no
// table): a search history is personal, and the server gains nothing from it. Storage can be
// missing or throw (private mode, blocked cookies), so every access is guarded and the list then
// lives in memory for the visit.
const KEY = 'pawsome.recentSearches';
export const MAX_RECENT = 6;

const ListSchema = z.array(z.string().min(1).max(100)).max(MAX_RECENT);

let memory: string[] | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeRecent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The same array until something changes (what useSyncExternalStore needs).
export function getRecentSearches(): string[] {
  if (memory === undefined) {
    let parsed: string[] = [];
    try {
      const raw = window.localStorage.getItem(KEY);
      const result = raw ? ListSchema.safeParse(JSON.parse(raw)) : undefined;
      if (result?.success) parsed = result.data;
    } catch {
      // Unreadable: start empty.
    }
    memory = parsed;
  }
  return memory;
}

function save(next: string[]): void {
  memory = next;
  try {
    if (next.length > 0) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Keep the in-memory copy.
  }
  emit();
}

/** Newest first, no duplicates (case-insensitive), capped at MAX_RECENT. */
export function addRecentSearch(term: string): void {
  const clean = term.trim().slice(0, 100);
  if (clean.length < 1) return;
  const rest = getRecentSearches().filter((t) => t.toLowerCase() !== clean.toLowerCase());
  save([clean, ...rest].slice(0, MAX_RECENT));
}

export function removeRecentSearch(term: string): void {
  save(getRecentSearches().filter((t) => t !== term));
}

export function clearRecentSearches(): void {
  save([]);
}

/** Tests only. */
export function resetRecentSearches(): void {
  memory = undefined;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  emit();
}
