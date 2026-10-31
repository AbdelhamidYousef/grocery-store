// Cookie consent, honestly. Today the shop sets only the cookies it needs to work (the session and
// the cart), which need no consent under the EU rules; there is no analytics or marketing code at
// all. So this module records one fact (the visitor has seen the notice) and answers one question
// for the rest of the code: `hasConsent(category)`.
//
// Later phases that add analytics, ads or embeds MUST ask `hasConsent('analytics')` (or the right
// category) before loading anything, and that stays false until a real choice UI exists and stores
// a grant here. Nothing may "default to yes".
//
// The record lives in localStorage, not a cookie: remembering "I saw the notice" must not itself
// need a cookie.
export const CONSENT_KEY = 'pawsome_consent_v1';

export type ConsentCategory = 'necessary' | 'preferences' | 'analytics' | 'marketing';

interface ConsentRecord {
  v: 1;
  /** ISO time the notice was acknowledged. */
  at: string;
  /** Categories the visitor said yes to. Only "necessary" exists today, and it needs no yes. */
  granted: ConsentCategory[];
}

function read(): ConsentRecord | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentRecord> | null;
    if (parsed?.v !== 1 || typeof parsed.at !== 'string' || !Array.isArray(parsed.granted)) {
      return null;
    }
    return { v: 1, at: parsed.at, granted: parsed.granted };
  } catch {
    // Blocked storage, private mode, corrupt JSON: behave as "never seen the notice".
    return null;
  }
}

/** Strictly necessary cookies need no consent; every other category needs a stored grant. */
export function hasConsent(category: ConsentCategory): boolean {
  if (category === 'necessary') return true;
  return read()?.granted.includes(category) ?? false;
}

/** True once the visitor has dismissed the notice (OK or Cookie details). */
export function hasSeenNotice(): boolean {
  return read() !== null;
}

/** Records that the notice was seen. Grants nothing: no optional category is offered yet. */
export function acknowledgeNotice(): void {
  const record: ConsentRecord = { v: 1, at: new Date().toISOString(), granted: [] };
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable: the banner will show again next visit, which is acceptable.
  }
}
