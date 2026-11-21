import { z } from 'zod';

import { tagSeeds } from './catalogue.ts';

export const TagSeedSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(40),
});
export type TagSeed = z.infer<typeof TagSeedSchema>;

// "Shop by need": what a product is for (breakfast, a quick dinner, a cleaning day).
export const tags: TagSeed[] = tagSeeds;
