// Loyalty maths, shared by the API (awards points) and the web ("Earn N points"), so the number
// shown before paying is the number awarded after. Everything is integer maths: points are whole
// numbers and 1 point = 1 cent when redeemed (100 points = EUR 1).

export const TIER_IDS = ['pup', 'good_dog', 'top_dog'] as const;
export type TierId = (typeof TIER_IDS)[number];

export interface Tier {
  id: TierId;
  label: string;
  /** Lifetime earned points needed (computed from the ledger, never stored). */
  minPoints: number;
  /** Earn rate in percent of the base rate: 100 = x1, 125 = x1.25, 150 = x1.5. */
  ratePercent: number;
}

export const TIERS: readonly Tier[] = [
  { id: 'pup', label: 'Pup', minPoints: 0, ratePercent: 100 },
  { id: 'good_dog', label: 'Good Dog', minPoints: 500, ratePercent: 125 },
  { id: 'top_dog', label: 'Top Dog', minPoints: 2000, ratePercent: 150 },
];

export const CENTS_PER_POINT = 1;

export function tierFor(lifetimeEarned: number): Tier {
  let found = TIERS[0]!;
  for (const tier of TIERS) if (lifetimeEarned >= tier.minPoints) found = tier;
  return found;
}

export const tierById = (id: TierId): Tier => TIERS.find((t) => t.id === id) ?? TIERS[0]!;

export function nextTierFor(lifetimeEarned: number): { tier: Tier; pointsNeeded: number } | null {
  const next = TIERS.find((t) => t.minPoints > lifetimeEarned);
  return next ? { tier: next, pointsNeeded: next.minPoints - lifetimeEarned } : null;
}

/**
 * Points for paid merchandise: 1 per WHOLE euro (the cents below a euro earn nothing), then the
 * tier's rate with the fraction dropped (23 euros at x1.25 is 28.75, so 28). Pass merchandise after
 * discounts, without shipping.
 */
export function pointsForCents(cents: number, tier: TierId | Tier = 'pup'): number {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`cents must be a non-negative safe integer, got ${cents}`);
  }
  const t = typeof tier === 'string' ? tierById(tier) : tier;
  return Math.floor((Math.floor(cents / 100) * t.ratePercent) / 100);
}

export const pointsToCents = (points: number): number => points * CENTS_PER_POINT;
