// Kits (bundles): pure money and stock maths. A kit is a normal variant whose price is its own
// `price_cents`; its components only decide "what would it cost separately" and "how many can we
// still make". Everything is integer cents / whole units, no floats.

export interface BundleComponentLine {
  priceCents: number;
  qty: number;
}

/** What the components cost bought one by one. */
export const individualTotalCents = (components: readonly BundleComponentLine[]): number =>
  components.reduce((sum, c) => sum + c.priceCents * c.qty, 0);

/** "Save €X vs individually": never negative (a kit priced above its parts saves nothing). */
export function bundleSavingCents(
  priceCents: number,
  components: readonly BundleComponentLine[],
): { individualCents: number; savingCents: number } {
  const individualCents = individualTotalCents(components);
  return { individualCents, savingCents: Math.max(0, individualCents - priceCents) };
}

/** Admin rule: a kit must be cheaper than its parts, or it is not a deal. */
export const isValidBundlePrice = (
  priceCents: number,
  components: readonly BundleComponentLine[],
): boolean => components.length > 0 && priceCents < individualTotalCents(components);

/**
 * Kits that can be made from the stock left: min over components of floor(available / qty).
 * Zero when there are no components (an empty kit is not for sale).
 */
export function bundleAvailable(components: readonly { available: number; qty: number }[]): number {
  if (components.length === 0) return 0;
  return Math.min(...components.map((c) => Math.floor(Math.max(0, c.available) / c.qty)));
}
