import type { StoreView } from '@store/shared';

// The URL decides the store view; this cookie only remembers the last one picked in the switcher,
// so a bare `/` or an old bookmark lands there. Set client-side, one year, readable by the SPA.
export const STORE_COOKIE = 'pawsome_store';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function readStoreCookie(): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${STORE_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(STORE_COOKIE.length + 1)) : null;
}

export function writeStoreCookie(store: StoreView): void {
  document.cookie = `${STORE_COOKIE}=${encodeURIComponent(store.code)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}
