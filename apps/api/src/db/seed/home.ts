import { HeroSlidesSchema, PromoTileSchema } from '@store/shared';

import type { Tx } from '../client.ts';
import { homeContent } from '../schema/index.ts';

// The first homepage blocks. Hero pictures are catalogue photos until the lead swaps in hero art
// (an admin can also change them). Original copy, made-up shop.
export const HERO_SLIDE_SEEDS = HeroSlidesSchema.parse([
  {
    title: 'Happy tails start here',
    text: 'Colourful, tough and tail-wag-approved supplies for every pet, from first walk to last nap.',
    ctaLabel: 'Shop dogs',
    ctaHref: '/c/dogs',
    imageUrl: '/products/dog-toys/braided-tug-rope-1.webp',
  },
  {
    title: 'Purr-fect playtime',
    text: 'Feather wands, crinkly mice and cosy caves for curious cats.',
    ctaLabel: 'Shop cats',
    ctaHref: '/c/cats',
    imageUrl: '/products/cat-toys/feather-wand-teaser-1.webp',
  },
  {
    title: 'Little pets, big love',
    text: 'Hay, hideaways and chews for the smallest members of the family.',
    ctaLabel: 'Shop small pets',
    ctaHref: '/c/small-pets',
    imageUrl: '/products/small-food/meadow-hay-bundle-1.webp',
  },
]);

export const PROMO_TILE_SEED = PromoTileSchema.parse({
  enabled: true,
  text: 'Free delivery on orders over 49 euros. Tails wag faster when the box arrives free.',
  linkLabel: 'See delivery details',
  linkHref: '/help',
});

// `onConflictDoNothing`: a row an admin has edited is theirs, re-seeding never overwrites it.
export async function seedHomeContent(tx: Tx): Promise<void> {
  await tx
    .insert(homeContent)
    .values([
      { key: 'hero_slides', value: HERO_SLIDE_SEEDS },
      { key: 'promo_tile', value: PROMO_TILE_SEED },
    ])
    .onConflictDoNothing({ target: homeContent.key });
}
