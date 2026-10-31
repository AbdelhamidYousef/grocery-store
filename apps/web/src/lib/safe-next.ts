// `?next=` carries where to go after login. It comes from the URL, so it is attacker-controlled:
// accepting `https://evil.example` or `//evil.example` would turn the login page into an open
// redirect. Only same-site absolute paths pass; everything else falls back.
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }
  return next;
}

export function loginUrl(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}
