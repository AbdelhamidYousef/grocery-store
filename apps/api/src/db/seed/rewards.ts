import { count } from 'drizzle-orm';

import type { Tx } from '../client.ts';
import { rewards } from '../schema/index.ts';

// What loyalty points can buy (phase 19). 100 points = EUR 1, so the vouchers are priced a little
// above face value on purpose: points are a thank-you, not a currency.
export const rewardSeeds = [
  {
    name: 'EUR 5 voucher',
    description: 'Five euros off your next order.',
    costPoints: 500,
    kind: 'coupon_fixed' as const,
    valueCents: 500,
  },
  {
    name: 'EUR 10 voucher',
    description: 'Ten euros off your next order: a better rate than two small ones.',
    costPoints: 950,
    kind: 'coupon_fixed' as const,
    valueCents: 1000,
  },
  {
    name: 'Free delivery',
    description: 'Delivery on us for one order, whatever the basket.',
    costPoints: 300,
    kind: 'free_shipping' as const,
    valueCents: 0,
  },
  {
    name: 'A free treat',
    description: 'Takes EUR 3.00 off your order: pick any chocolate, biscuit or snack you like.',
    costPoints: 300,
    kind: 'gift' as const,
    valueCents: 300,
  },
];

// Seeded only into an empty table: rewards an admin edited or deleted are theirs, and re-seeding
// must not bring a deleted one back.
export async function seedRewards(tx: Tx): Promise<void> {
  const [row] = await tx.select({ n: count() }).from(rewards);
  if ((row?.n ?? 0) > 0) return;
  await tx.insert(rewards).values(rewardSeeds);
}
