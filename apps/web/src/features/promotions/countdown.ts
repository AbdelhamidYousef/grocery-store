import { lookupFor, type TFunction } from '../../i18n';

const english = lookupFor('en-IE').t;

// "2h 13m": what the banner says. Whole units, rounded DOWN so it never promises more time than
// there is. Under an hour the seconds are shown, because that is when people watch it.
export function formatCountdown(ms: number, t: TFunction = english): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return t('shell.countdown.dh', { d: days, h: hours });
  if (hours > 0) return t('shell.countdown.hm', { h: hours, m: minutes });
  if (minutes > 0)
    return t('shell.countdown.ms', { m: minutes, s: String(seconds).padStart(2, '0') });
  return t('shell.countdown.s', { s: seconds });
}

// Dismissed sale ids live in localStorage. Storage can be missing or throw (private mode, blocked
// cookies, a full disk): every access is wrapped and the banner then simply forgets on reload.
const KEY = 'grocery:sale-banner-dismissed';
const KEEP = 20;

export function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberDismissed(id: string): void {
  try {
    const next = [...readDismissed().filter((x) => x !== id), id].slice(-KEEP);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not remembered; the in-memory state still hides it for this visit.
  }
}
