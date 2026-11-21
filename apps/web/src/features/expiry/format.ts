// A best-before date is a calendar day ("2026-11-25"), not an instant, so it is formatted in UTC:
// `new Date('2026-11-25')` is UTC midnight and a local-zone formatter would print the day before
// for a browser west of Greenwich.
export function formatBestBefore(day: string, locale: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}
