import type { CookieOptions, Request, Response } from 'express';

export const SESSION_COOKIE = 'sid';
const SESSION_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

// Secure cookies are only sent over HTTPS, which production has (Render/Vercel terminate TLS) and
// local http://localhost does not. `res.app.get('env')` is what createApp set from its config.
const isProduction = (res: Response) => res.app.get('env') === 'production';

// Everything that makes the cookie safe is here, in one place:
// - httpOnly: page scripts (and so XSS) cannot read the session id.
// - sameSite=lax: the browser withholds it from cross-site POST/fetch requests (first CSRF layer;
//   the Origin check is the second). Lax, not Strict, so a link from an email still arrives signed in.
// - secure in production: never travels over plain HTTP.
// - path=/: the API lives under /api, but the Vercel rewrite keeps cookies on the web origin.
// No `domain`: a host-only cookie is not shared with sibling subdomains.
// The value is not signed: it is already 256 random bits looked up by hash, so a signature would
// add nothing a forged value could not already fail on.
function baseOptions(res: Response): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: isProduction(res), path: '/' };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions(res), maxAge: SESSION_MAX_AGE_MS });
}

// The attributes must match the ones used to set the cookie, or the browser keeps the original.
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, baseOptions(res));
}

// cookie-parser fills req.cookies with whatever the client sent; only trust strings.
export function readSessionCookie(req: Request): string | null {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
