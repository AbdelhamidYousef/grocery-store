// Dates are shown in the shopper's own locale and time zone. `undefined` as the locale means "the
// browser's"; the API sends ISO strings in UTC.
export function formatDate(iso: string, withTime = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}
