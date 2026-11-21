import {
  HeroSlidesSchema,
  PromoTileSchema,
  type AdminHomeContent,
  type HeroSlide,
  type HomeContentKey,
  type PromoTile,
} from '@store/shared';
import { eq } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { homeContent } from '../../db/schema/index.ts';

// What the homepage shows until an admin edits it. Original, generic copy; images are optional
// (the owner adds real ones through the image pipeline).
export const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  {
    title: 'Fresh fruit and veg, today',
    text: 'Berries, tomatoes and herbs, at your door in 30 minutes.',
    ctaLabel: 'Shop fruit & veg',
    ctaHref: '/c/fruit-veg',
    imageUrl: null,
  },
  {
    title: 'Baked this morning',
    text: 'Rolls, loaves and croissants from the neighbourhood bakery.',
    ctaLabel: 'Shop bakery',
    ctaHref: '/c/bakery',
    imageUrl: null,
  },
  {
    title: 'Dinner in ten minutes',
    text: 'Pizza, fish fingers and fries, delivered frozen.',
    ctaLabel: 'Shop frozen',
    ctaHref: '/c/frozen',
    imageUrl: null,
  },
];

export const DEFAULT_PROMO_TILE: PromoTile = {
  enabled: false,
  text: null,
  linkLabel: null,
  linkHref: null,
};

// A stored value that no longer matches its schema (an old shape after a deploy) falls back to the
// default instead of breaking the homepage.
export async function getHomeContent(): Promise<AdminHomeContent> {
  const rows = await db.select().from(homeContent);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const hero = HeroSlidesSchema.safeParse(byKey.get('hero_slides'));
  const promo = PromoTileSchema.safeParse(byKey.get('promo_tile'));
  return {
    heroSlides: hero.success ? hero.data : DEFAULT_HERO_SLIDES,
    promoTile: promo.success ? promo.data : DEFAULT_PROMO_TILE,
  };
}

export async function putHomeContent(key: HomeContentKey, value: unknown): Promise<void> {
  await db
    .insert(homeContent)
    .values({ key, value })
    .onConflictDoUpdate({ target: homeContent.key, set: { value, updatedAt: new Date() } });
}

export async function deleteHomeContent(key: HomeContentKey): Promise<void> {
  await db.delete(homeContent).where(eq(homeContent.key, key));
}
