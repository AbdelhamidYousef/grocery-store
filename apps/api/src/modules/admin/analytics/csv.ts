// CSV for spreadsheets. Two things must be right:
//   - quoting: a cell with a comma, quote or line break is wrapped in quotes, quotes doubled;
//   - formula injection: a spreadsheet runs a cell that STARTS with = + - @ (or a tab / carriage
//     return) as a formula, so a customer-controlled text like `=HYPERLINK(...)` would execute on
//     the admin's machine. Such TEXT is prefixed with an apostrophe, which spreadsheets show as
//     plain text. Numbers we generate (integers, possibly negative) are written as they are.
export type CsvCell = string | number | null;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export const csvRow = (cells: CsvCell[]): string => `${cells.map(csvCell).join(',')}\r\n`;

// Integer cents as "12.34" without floats (the formatted column next to every amount).
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
