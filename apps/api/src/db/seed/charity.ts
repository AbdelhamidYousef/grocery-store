import type { Tx } from '../client.ts';
import { charities } from '../schema/index.ts';

// DEMO: two made-up Berlin food banks. No money moves anywhere; the site says so on every page
// that shows it. The shop supports the first one for now (see loyalty/charity-service.ts); the
// second is there for the day a shopper can choose.
export const charitySeeds = [
  {
    slug: 'spreeufer-food-bank',
    name: 'Spreeufer Food Bank',
    description:
      'A fictional food bank in Berlin that hands out fresh and tinned groceries to neighbours who need them, twice a week. It exists only in this demo store: nothing you donate here goes anywhere.',
  },
  {
    slug: 'kiez-pantry',
    name: 'Kiez Pantry',
    description:
      'A fictional community pantry in Berlin where neighbours leave and collect food for free. It exists only in this demo store: nothing you donate here goes anywhere.',
  },
];

// Upsert on the slug so a re-seed refreshes the wording without duplicating a food bank.
export async function seedCharity(tx: Tx): Promise<void> {
  for (const charity of charitySeeds) {
    await tx
      .insert(charities)
      .values(charity)
      .onConflictDoUpdate({
        target: charities.slug,
        set: { name: charity.name, description: charity.description },
      });
  }
}
