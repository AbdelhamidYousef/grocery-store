// When does a pet get a birthday mail or a "time to switch food" mail? Pure date maths on plain
// calendar strings (YYYY-MM-DD): a birthday has no time zone, and the caller decides what "today"
// is (the job passes the UTC date of its clock), so tests need no clock at all.

export const BIRTHDAY_CODE_PERCENT = 10;
export const BIRTHDAY_CODE_DAYS = 14;
/** A milestone is still mailed this many days late (a job that missed a day catches up). */
export const LIFE_STAGE_GRACE_DAYS = 7;

export const PET_MILESTONES = [
  { kind: 'life_stage_8w', label: '8 weeks', add: { days: 56 } },
  { kind: 'life_stage_6m', label: '6 months', add: { months: 6 } },
  { kind: 'life_stage_12m', label: '12 months', add: { months: 12 } },
] as const;
export type LifeStageKind = (typeof PET_MILESTONES)[number]['kind'];

/** Species that have a puppy or kitten stage. */
export const YOUNG_SPECIES = ['dog', 'cat'] as const;

const DAY_MS = 86_400_000;
const parse = (d: string): { y: number; m: number; day: number } => {
  const [y = 0, m = 0, day = 0] = d.split('-').map(Number);
  return { y, m, day };
};
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d);
const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Adds calendar months, clamping the day (31 Aug + 6 months = 28 Feb). */
export function addMonths(date: string, months: number): string {
  const { y, m, day } = parse(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(utc(ny, nm, Math.min(day, daysInMonth(ny, nm))));
}

/**
 * Is `today` this pet's birthday? Born on 29 Feb: the birthday is 29 Feb in a leap year and 28 Feb
 * in a common year. The day of birth itself is not a birthday (age 0).
 */
export function isBirthdayToday(birthday: string, today: string): boolean {
  const b = parse(birthday);
  const t = parse(today);
  if (t.y <= b.y) return false;
  if (b.m === 2 && b.day === 29) {
    return t.m === 2 && t.day === (isLeap(t.y) ? 29 : 28);
  }
  return b.m === t.m && b.day === t.day;
}

/** The life-stage milestones reached in the last LIFE_STAGE_GRACE_DAYS days (usually 0 or 1). */
export function lifeStagesDue(birthday: string, today: string): LifeStageKind[] {
  const todayMs = utc(parse(today).y, parse(today).m, parse(today).day);
  return PET_MILESTONES.flatMap((s) => {
    const at =
      'days' in s.add
        ? iso(utc(parse(birthday).y, parse(birthday).m, parse(birthday).day) + s.add.days * DAY_MS)
        : addMonths(birthday, s.add.months);
    const atMs = utc(parse(at).y, parse(at).m, parse(at).day);
    const late = (todayMs - atMs) / DAY_MS;
    return late >= 0 && late < LIFE_STAGE_GRACE_DAYS ? [s.kind] : [];
  });
}
