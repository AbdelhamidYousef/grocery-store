import { count } from 'drizzle-orm';

import type { Tx } from '../client.ts';
import { menuPromos } from '../schema/index.ts';

// The featured tile of each mega-menu panel. Pictures are catalogue photos (reptiles: the
// placeholder illustration) until the lead swaps in promo art; an admin can change every field.
// `pet: null` is the fallback for a panel with no promo of its own.
export const MENU_PROMO_SEEDS = [
  {
    pet: 'dog',
    title: 'Walkies, sorted',
    subtitle: 'Leads, harnesses and tough toys for every adventure.',
    imageUrl: '/products/dog-toys/braided-tug-rope-1.webp',
    imageAlt: 'A braided rope tug toy',
    link: '/c/dog-walk',
  },
  {
    pet: 'cat',
    title: 'Purr-fect playtime',
    subtitle: 'Feather wands, crinkly mice and kicker toys.',
    imageUrl: '/products/cat-toys/feather-wand-teaser-1.webp',
    imageAlt: 'A feather wand teaser toy',
    link: '/c/cat-toys',
  },
  {
    pet: 'bird',
    title: 'Feed the flock',
    subtitle: 'Seed blends and feeders for happy beaks.',
    imageUrl: '/products/bird-feeders/hanging-seed-feeder-1.webp',
    imageAlt: 'A hanging seed feeder',
    link: '/c/birds',
  },
  {
    pet: 'fish',
    title: 'Aquarium makeover',
    subtitle: 'Hideouts, plants and soft glow lighting.',
    imageUrl: '/products/fish-tanks/coral-cave-hideout-1.webp',
    imageAlt: 'A coral cave hideout for an aquarium',
    link: '/c/fish',
  },
  {
    pet: 'small',
    title: 'Little pets, big love',
    subtitle: 'Hay, hideaways and chews for small friends.',
    imageUrl: '/products/small-food/meadow-hay-bundle-1.webp',
    imageAlt: 'A bundle of meadow hay',
    link: '/c/small-pets',
  },
  {
    pet: 'reptile',
    title: 'Warm and cosy habitats',
    subtitle: 'Everything a scaly friend needs to thrive.',
    imageUrl: '/products/placeholders/reptile.svg',
    imageAlt: 'A friendly reptile illustration',
    link: '/c/reptiles',
  },
  {
    pet: null,
    title: 'Free delivery over 49 euros',
    subtitle: 'Tails wag faster when the box arrives free.',
    imageUrl: '/products/dog-toys/braided-tug-rope-1.webp',
    imageAlt: 'A braided rope tug toy',
    link: '/help',
  },
] as const;

// Seeded only into an empty table: promos an admin has edited, reordered or deleted are theirs,
// and re-seeding must not bring a deleted one back.
export async function seedMenuPromos(tx: Tx): Promise<void> {
  const [row] = await tx.select({ n: count() }).from(menuPromos);
  if ((row?.n ?? 0) > 0) return;
  await tx
    .insert(menuPromos)
    .values(MENU_PROMO_SEEDS.map((p, i) => ({ ...p, sortOrder: i, active: true })));
}
