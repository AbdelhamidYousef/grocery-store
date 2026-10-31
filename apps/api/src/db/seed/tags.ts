import { z } from 'zod';

export const TagSeedSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(40),
});
export type TagSeed = z.infer<typeof TagSeedSchema>;

// "Shop by health need": what a product is meant to help with.
export const tags: TagSeed[] = [
  { slug: 'joints', name: 'Joints & mobility' },
  { slug: 'dental', name: 'Dental care' },
  { slug: 'calming', name: 'Calming' },
  { slug: 'sensitive-tummy', name: 'Sensitive tummy' },
  { slug: 'skin-coat', name: 'Skin & coat' },
  { slug: 'weight', name: 'Weight control' },
];
