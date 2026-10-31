// The editors work in UTC (like the rest of the back office, which says so on screen), so the
// `datetime-local` value ("2026-10-31T12:30") and the API's ISO string convert without any time
// zone arithmetic: append or cut the seconds and the Z.
export const isoToInput = (iso: string | null | undefined): string => (iso ? iso.slice(0, 16) : '');

export const inputToIso = (value: string): string | null => (value ? `${value}:00.000Z` : null);
