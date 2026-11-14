import { PetSchema, NetUnitSchema } from '@store/shared';
import { z } from 'zod';

import { BrandSeedSchema, brands } from './brands.ts';
import { categories } from './categories.ts';
import { CollectionSeedSchema, collections } from './collections.ts';
import type { ProductSeed } from './expand.ts';
import { TagSeedSchema, tags } from './tags.ts';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lower-case letters, digits, dashes');

const OptionValueSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  priceDeltaCents: z.number().int().optional(),
  weightFactor: z.number().positive().optional(),
  netAmount: z.number().int().positive().optional(),
  isTrial: z.boolean().optional(),
  absolutePriceCents: z.number().int().min(0).optional(),
});

// The shape every product file must have. Running it at start-up means a typo (a price in euros,
// a slug with a space, a missing description) fails the seed with the product named, instead of
// showing up as a broken card in the UI.
export const SeedProductSchema = z.object({
  slug,
  name: z.string().min(3).max(120),
  code: z.string().regex(/^[A-Z0-9]{2,10}$/, 'upper-case letters and digits'),
  categorySlug: slug,
  pet: PetSchema,
  material: z.string().min(2),
  ageStage: z.enum(['puppy', 'kitten', 'adult', 'senior', 'all']),
  description: z.string().min(40).max(600),
  look: z.string().min(20),
  basePriceCents: z.number().int().min(50).max(100_000),
  baseWeightGrams: z.number().int().positive(),
  axes: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z]+$/),
        values: z.array(OptionValueSchema).min(1).max(6),
      }),
    )
    .max(3),
  onSale: z.boolean().optional(),
  brand: slug.optional(),
  tags: z.array(slug).max(4).optional(),
  collections: z.array(slug).max(4).optional(),
  eco: z.boolean().optional(),
  vetApproval: z.boolean().optional(),
  bestseller: z.boolean().optional(),
  isNew: z.boolean().optional(),
  netUnit: NetUnitSchema.optional(),
  net: z.number().int().positive().optional(),
});

export class SeedValidationError extends Error {}

/** Throws a SeedValidationError naming the first problem; returns the input when it is sound. */
export function validateSeed(products: readonly ProductSeed[]): readonly ProductSeed[] {
  for (const b of brands) BrandSeedSchema.parse(b);
  for (const t of tags) TagSeedSchema.parse(t);
  for (const c of collections) CollectionSeedSchema.parse(c);

  const brandSlugs = new Set(brands.map((b) => b.slug));
  const tagSlugs = new Set(tags.map((t) => t.slug));
  const listedCollections = new Set(
    collections.filter((c) => c.membership === 'listed').map((c) => c.slug),
  );
  const leaves = new Set(categories.flatMap((c) => c.children.map((child) => child.slug)));
  const seen = new Set<string>();

  for (const p of products) {
    const parsed = SeedProductSchema.safeParse(p);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new SeedValidationError(
        `product ${p.slug ?? '(no slug)'}: ${issue?.path.join('.')} ${issue?.message}`,
      );
    }
    const fail = (msg: string) => {
      throw new SeedValidationError(`product ${p.slug}: ${msg}`);
    };
    if (seen.has(p.slug)) fail('duplicate slug');
    seen.add(p.slug);
    if (!leaves.has(p.categorySlug)) fail(`unknown category ${p.categorySlug}`);
    if (p.brand && !brandSlugs.has(p.brand)) fail(`unknown brand ${p.brand}`);
    for (const t of p.tags ?? []) if (!tagSlugs.has(t)) fail(`unknown tag ${t}`);
    for (const c of p.collections ?? [])
      if (!listedCollections.has(c)) fail(`unknown or computed collection ${c}`);
  }
  return products;
}
