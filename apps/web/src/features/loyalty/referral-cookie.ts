// The referral code a visitor arrived with (`/?ref=PAWABCDE`), kept for 30 days so it survives
// browsing around before they register. A plain, functional cookie (not localStorage) because the
// API has to read it when the account is created. It holds a public code and nothing else.
export const REFERRAL_COOKIE = 'pawsome_ref';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const VALID = /^[A-Za-z0-9-]{4,24}$/;

export function captureReferral(search: string): boolean {
  const code = new URLSearchParams(search).get('ref');
  if (!code || !VALID.test(code)) return false;
  try {
    document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(code.toUpperCase())}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
    return true;
  } catch {
    return false;
  }
}

export function readReferral(): string | null {
  try {
    const match = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${REFERRAL_COOKIE}=`))
      ?.slice(REFERRAL_COOKIE.length + 1);
    return match ? decodeURIComponent(match) : null;
  } catch {
    return null;
  }
}

export function clearReferral(): void {
  try {
    document.cookie = `${REFERRAL_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // Nothing to clean up if cookies are blocked.
  }
}
