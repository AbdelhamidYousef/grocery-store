import { HeroSlidesSchema, PromoTileSchema } from '@store/shared';

import type { Tx } from '../client.ts';
import { homeContent } from '../schema/index.ts';

// The first homepage blocks. Hero pictures are catalogue photos or department placeholders until
// the owner swaps in hero art (an admin can also change them). Original copy, made-up shop.
export const HERO_SLIDE_SEEDS = HeroSlidesSchema.parse([
  {
    title: 'Fresh fruit and veg, today',
    text: 'Berries, tomatoes and herbs, picked this morning and at your door in 30 minutes.',
    ctaLabel: 'Shop fruit & veg',
    ctaHref: '/c/fruit-veg',
    imageUrl: '/products/fruit/bananas-1.webp',
  },
  {
    title: 'Baked this morning',
    text: 'Rolls, loaves and croissants from Ofenfrisch, still warm when they arrive.',
    ctaLabel: 'Shop bakery',
    ctaHref: '/c/bakery',
    imageUrl: '/products/placeholders/bakery.svg',
  },
  {
    title: 'Dinner in ten minutes',
    text: 'Pizza, fish fingers and fries from the freezer, delivered cold.',
    ctaLabel: 'Shop frozen',
    ctaHref: '/c/frozen',
    imageUrl: '/products/placeholders/frozen.svg',
  },
]);

export const PROMO_TILE_SEED = PromoTileSchema.parse({
  enabled: true,
  text: 'Free delivery on orders over 49 euros.',
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
