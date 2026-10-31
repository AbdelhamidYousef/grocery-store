// Money is integer minor units (cents) everywhere: 0.1 + 0.2 !== 0.3 in floats, and a store that
// is off by a cent fails reconciliation with Stripe. Only formatting ever turns cents into a
// decimal, and it is delegated to Intl.

function assertCents(value: number, name = 'cents'): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer number of cents, got ${value}`);
  }
}

function assertNonNegative(value: number, name = 'cents'): void {
  assertCents(value, name);
  if (value < 0) {
    throw new RangeError(`${name} must not be negative, got ${value}`);
  }
}

// Intl handles currency-specific decimals (JPY has none) and symbol placement, which hand-rolled
// `$${cents / 100}` formatting gets wrong. Amounts here are always 2-decimal currencies in this
// project, so dividing by 100 for display is the only non-integer step and it never feeds back.
export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  assertCents(cents);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    assertCents(value);
    total += value;
  }
  assertCents(total, 'sum');
  return total;
}

// `percent` may have up to two decimals (7.25). It is scaled to integer basis points first so the
// only division is one exact-integer / integer division; halves round up, never down.
export function applyPercent(cents: number, percent: number): number {
  assertNonNegative(cents);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`percent must be between 0 and 100, got ${percent}`);
  }
  const basisPoints = Math.round(percent * 100);
  return Math.round((cents * basisPoints) / 10_000);
}
