// Largest-remainder allocation: split `total` cents across `weights` so the parts are integers
// that add up to `total` exactly (never a cent lost or invented). Each part starts at
// floor(total * weight / sum); the cents left over go, one each, to the largest fractional
// remainders. Ties go to the earlier index so the result is deterministic.
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(`total must be a non-negative integer, got ${total}`);
  }
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) {
      throw new RangeError(`weights must be non-negative integers, got ${w}`);
    }
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || weights.length === 0) return weights.map(() => 0);
  if (sum === 0) throw new RangeError('cannot allocate a positive total over zero weight');

  // BigInt keeps total * weight exact even for large carts.
  const parts = weights.map((w) => (BigInt(total) * BigInt(w)) / BigInt(sum));
  const remainders = weights.map((w, i) => ({
    i,
    rem: (BigInt(total) * BigInt(w)) % BigInt(sum),
  }));
  let left = total - parts.reduce((a, p) => a + Number(p), 0);
  remainders.sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  const result = parts.map(Number);
  for (const { i, rem } of remainders) {
    if (left === 0 || rem === 0n) break;
    result[i]! += 1;
    left -= 1;
  }
  return result;
}
