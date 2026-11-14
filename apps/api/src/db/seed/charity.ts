import type { Tx } from '../client.ts';
import { charities } from '../schema/index.ts';

// DEMO: a made-up shelter. No money moves anywhere; the site says so on every page that shows it.
export const charitySeed = {
  slug: 'whisker-hollow-rescue',
  name: 'Whisker Hollow Rescue',
  description:
    'A fictional shelter in a quiet valley that finds homes for stray cats, dogs and the occasional rabbit. It exists only in this demo store: nothing you donate here goes anywhere.',
};

// Upsert on the slug so a re-seed refreshes the wording without duplicating the shelter.
export async function seedCharity(tx: Tx): Promise<void> {
  await tx
    .insert(charities)
    .values(charitySeed)
    .onConflictDoUpdate({
      target: charities.slug,
      set: { name: charitySeed.name, description: charitySeed.description },
    });
}
