import { z } from 'zod';

export const CollectionSeedSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(60),
  description: z.string().min(10).max(300),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  // `window` is a month/day range repeated every year; evergreen collections have none.
  window: z
    .object({
      start: z.object({
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
      }),
      end: z.object({
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
      }),
    })
    .optional(),
  // How members are picked. `listed` collections are named on the product (`collections: [...]`
  // in the product seed); the others are computed from the product's own data so they cannot go
  // stale when a price changes.
  membership: z.enum(['listed', 'eco', 'under-2']),
});
export type CollectionSeed = z.infer<typeof CollectionSeedSchema>;

export const collections: CollectionSeed[] = [
  {
    slug: 'christmas-baking',
    name: 'Christmas baking',
    description: 'Flour, butter, nuts and Lebkuchen for the advent weekends.',
    accentColor: '#DC2626',
    window: { start: { month: 11, day: 15 }, end: { month: 12, day: 27 } },
    membership: 'listed',
  },
  {
    slug: 'bbq-season',
    name: 'BBQ season',
    description: 'Sausages, drumsticks, salad and cold drinks for the grill.',
    accentColor: '#EA580C',
    window: { start: { month: 5, day: 1 }, end: { month: 9, day: 15 } },
    membership: 'listed',
  },
  {
    slug: 'weekday-lunch',
    name: 'Weekday lunch',
    description: 'Quick things for a packed lunch or a fast bite at the desk.',
    accentColor: '#0F7A3D',
    membership: 'listed',
  },
  {
    slug: 'organic-picks',
    name: 'Organic picks',
    description: 'Certified organic fruit, vegetables and pantry staples.',
    accentColor: '#15803D',
    membership: 'eco',
  },
  {
    slug: 'under-2',
    name: 'Under €2',
    description: 'Everyday items at small prices. Every product here costs less than 2 euros.',
    accentColor: '#0EA5E9',
    membership: 'under-2',
  },
];

/** The next (or current) occurrence of a yearly window, as real dates, relative to `now`. */
export function windowDates(
  window: NonNullable<CollectionSeed['window']>,
  now: Date,
): { startsAt: Date; endsAt: Date } {
  const make = (year: number) => {
    const startsAt = new Date(Date.UTC(year, window.start.month - 1, window.start.day));
    // Ends at the *end* of its last day. A window that wraps the new year ends next year.
    const endYear = window.end.month < window.start.month ? year + 1 : year;
    const endsAt = new Date(Date.UTC(endYear, window.end.month - 1, window.end.day + 1));
    return { startsAt, endsAt };
  };
  const thisYear = make(now.getUTCFullYear());
  return thisYear.endsAt > now ? thisYear : make(now.getUTCFullYear() + 1);
}
