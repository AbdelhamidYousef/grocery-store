import { STORE_TIME_ZONE, type AnalyticsInterval } from '@store/shared';

// The presets of the dashboard. The choice lives in the URL (`?days=7|30|90`), so a view can be
// shared; anything else falls back to 30.
export const PRESETS = [7, 30, 90] as const;
export type Preset = (typeof PRESETS)[number];

export function parsePreset(value: string | null): Preset {
  const n = Number(value);
  return (PRESETS as readonly number[]).includes(n) ? (n as Preset) : 30;
}

// Weekly points keep a 90-day chart readable; shorter ranges show every day.
export const intervalFor = (days: Preset): AnalyticsInterval => (days > 30 ? 'week' : 'day');

const DAY_MS = 86_400_000;

// "Today" on the SHOP's calendar (what the API counts days in), not the browser's.
export function todayInStore(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function rangeFor(days: Preset, now: Date = new Date()): { from: string; to: string } {
  const to = todayInStore(now);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

// 1234 basis points -> "12.34 %" without floats.
export function formatBasisPoints(bp: number): string {
  return `${Math.trunc(bp / 100)}.${String(bp % 100).padStart(2, '0')} %`;
}
