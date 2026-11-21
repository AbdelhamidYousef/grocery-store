// Delivery slots: one-hour windows per dark store. Pure functions, the clock is an argument, and
// the SHOP's zone decides every day, opening hour and label; the visitor's own zone is never used.
// A slot is stored as a plain instant (timestamptz); only the wall-clock rules live here.

export const SHOP_ZONE = 'Europe/Berlin';

export const SLOT_RULES = {
  /** Length of one slot. */
  lengthMinutes: 60,
  /** A slot stops being bookable this long before it starts. */
  cutoffMinutes: 60,
  /**
   * Slots exist for today and the days after it, six days in all: a card hold lasts 7 days at
   * Stripe (manual capture, G6), and an order is captured when it is packed.
   */
  daysAhead: 6,
  /** How long a chosen slot is held for the cart. */
  holdMinutes: 15,
  /** Express delivery window and the period its rider limit is counted over. */
  expressMinutes: 30,
} as const;

export const DEFAULT_OPENS_AT = '08:00';
export const DEFAULT_CLOSES_AT = '22:00';

// ---------- calendar dates as plain strings (no time zone inside them) ----------

const pad = (n: number) => String(n).padStart(2, '0');
const fromKey = (key: string) => {
  const [y = 0, m = 0, d = 0] = key.split('-').map(Number);
  return { y, m, d };
};

/** "YYYY-MM-DD" plus whole days. Goes through UTC noon, which has no daylight-saving edge. */
export function addDays(key: string, days: number): string {
  const { y, m, d } = fromKey(key);
  const date = new Date(Date.UTC(y, m - 1, d + days, 12));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** "08:00" -> minutes after local midnight. */
export function parseClock(value: string): number {
  const [h = 0, m = 0] = value.split(':').map(Number);
  return h * 60 + m;
}

// ---------- time zones ----------

function zoneParts(instant: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    minutes: get('hour') * 60 + get('minute'),
  };
}

/** The calendar day ("YYYY-MM-DD") it is in `zone` at this instant. */
export function dateKeyIn(instant: Date, zone: string = SHOP_ZONE): string {
  const p = zoneParts(instant.getTime(), zone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/**
 * The instant at which the wall clock in `zone` shows `key` at `minutes` after midnight. The zone's
 * offset is looked up at the instant itself, twice: the second pass settles the hour around a
 * daylight-saving change. A wall time that does not exist (02:30 on the spring change day) lands
 * one hour later, one that exists twice (02:30 in autumn) lands on its second occurrence (after the clocks went back).
 */
export function zonedInstant(key: string, minutes: number, zone: string = SHOP_ZONE): Date {
  const { y, m, d } = fromKey(key);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  const offsetAt = (instant: number) => {
    const p = zoneParts(instant, zone);
    return Date.UTC(p.y, p.m - 1, p.d, 0, p.minutes) - instant;
  };
  const first = wall - offsetAt(wall);
  return new Date(wall - offsetAt(first));
}

// ---------- building slots ----------

export interface SlotWindow {
  startsAt: Date;
  endsAt: Date;
}

/**
 * The slots of one local day for a store open from `opensAt` to `closesAt` ("HH:MM"): back-to-back
 * windows built from wall-clock times, so 08:00 is 08:00 on a day with 23 or 25 hours too. A last
 * window that would end after closing is not created.
 */
export function slotsForDay(
  key: string,
  opensAt: string = DEFAULT_OPENS_AT,
  closesAt: string = DEFAULT_CLOSES_AT,
  zone: string = SHOP_ZONE,
): SlotWindow[] {
  const closes = parseClock(closesAt);
  const out: SlotWindow[] = [];
  for (
    let start = parseClock(opensAt);
    start + SLOT_RULES.lengthMinutes <= closes;
    start += SLOT_RULES.lengthMinutes
  ) {
    out.push({
      startsAt: zonedInstant(key, start, zone),
      endsAt: zonedInstant(key, start + SLOT_RULES.lengthMinutes, zone),
    });
  }
  return out;
}

/** The local day keys that get slots: today and the days after it. */
export function slotDayKeys(now: Date, zone: string = SHOP_ZONE): string[] {
  const today = dateKeyIn(now, zone);
  return Array.from({ length: SLOT_RULES.daysAhead }, (_, i) => addDays(today, i));
}

/** Every slot window for the next days, in order. */
export function slotsForHorizon(
  now: Date,
  opensAt: string = DEFAULT_OPENS_AT,
  closesAt: string = DEFAULT_CLOSES_AT,
  zone: string = SHOP_ZONE,
): SlotWindow[] {
  return slotDayKeys(now, zone).flatMap((key) => slotsForDay(key, opensAt, closesAt, zone));
}

// ---------- rules ----------

/** The last instant a slot can still be booked. */
export function slotCutoff(startsAt: Date): Date {
  return new Date(startsAt.getTime() - SLOT_RULES.cutoffMinutes * 60_000);
}

/** True once it is too late to book the slot (at the cutoff itself it is already closed). */
export function isSlotClosed(startsAt: Date, now: Date): boolean {
  return now.getTime() >= slotCutoff(startsAt).getTime();
}

/** Is the store open at this instant, by its local hours? */
export function isStoreOpen(
  now: Date,
  opensAt: string = DEFAULT_OPENS_AT,
  closesAt: string = DEFAULT_CLOSES_AT,
  zone: string = SHOP_ZONE,
): boolean {
  const p = zoneParts(now.getTime(), zone);
  return p.minutes >= parseClock(opensAt) && p.minutes < parseClock(closesAt);
}

// ---------- labels ----------

/** "14:30": one time on the 24-hour clock in the shop's zone. */
export function formatClock(at: Date, zone: string = SHOP_ZONE): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** "14:00–15:00", 24-hour clock in the shop's zone, the same in every language. */
export function formatSlotRange(startsAt: Date, endsAt: Date, zone: string = SHOP_ZONE): string {
  return `${formatClock(startsAt, zone)}–${formatClock(endsAt, zone)}`;
}

export type SlotDayKind = 'today' | 'tomorrow' | 'later';

/** Where a slot's day sits relative to now, in the shop's zone ("later" gets a weekday name). */
export function slotDayKind(startsAt: Date, now: Date, zone: string = SHOP_ZONE): SlotDayKind {
  const today = dateKeyIn(now, zone);
  const day = dateKeyIn(startsAt, zone);
  if (day === today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  return 'later';
}

/** "Mon 22 Nov" / "Mo., 22. Nov." in the shop's zone. */
export function formatSlotDate(startsAt: Date, locale: string, zone: string = SHOP_ZONE): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(startsAt);
}

const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * "Today 14:00–15:00", "Tomorrow 09:00–10:00", "Mon 22 Nov 09:00–10:00" (`style: 'sentence'` keeps today and
 * tomorrow lower case, for use inside a sentence). Today and tomorrow come
 * from Intl, so the German label says "Heute" and "Morgen" without a dictionary.
 */
export function formatSlotLabel(
  startsAt: Date,
  endsAt: Date,
  now: Date,
  locale: string,
  zone: string = SHOP_ZONE,
  style: 'label' | 'sentence' = 'label',
): string {
  const kind = slotDayKind(startsAt, now, zone);
  const range = formatSlotRange(startsAt, endsAt, zone);
  if (kind === 'later') return `${formatSlotDate(startsAt, locale, zone)} ${range}`;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const day = rtf.format(kind === 'today' ? 0 : 1, 'day');
  // "label" starts a line ("Today 14:00"), "sentence" sits inside one ("Next delivery: today 14:00").
  return `${style === 'label' ? capitalise(day) : day} ${range}`;
}
