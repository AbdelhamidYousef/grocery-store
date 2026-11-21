import { z } from 'zod';

import { HOUSE_BRAND, brandSeeds } from './catalogue.ts';

export const BrandSeedSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(60),
  tagline: z.string().min(5).max(120),
  story: z.string().min(40).max(600),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
export type BrandSeed = z.infer<typeof BrandSeedSchema>;

// Eight made-up brands (the shop's own label, "Grocery Basics", among them), read from the
// catalogue file. Any resemblance to a real label is a coincidence we checked for; see the
// decisions log.
export { HOUSE_BRAND };
export const brands: BrandSeed[] = brandSeeds;
