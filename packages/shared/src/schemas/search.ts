import { z } from 'zod';

import { DataSchema } from './common.ts';

// ---------- search suggestions (phase 15) ----------

// Two characters is the least a prefix search can say anything with; the API answers 400 below
// that (the web does not even ask).
export const SUGGEST_MIN_CHARS = 2;

export const SuggestQuerySchema = z.object({
  q: z.string().trim().min(SUGGEST_MIN_CHARS, 'Type at least 2 characters').max(100),
});

// Minimal fields only: this answers on every keystroke and is cached publicly, so it carries no
// member price, no stock and nothing about the viewer.
export const SuggestProductSchema = z.object({
  name: z.string(),
  slug: z.string(),
  imageUrl: z.string().nullable(),
  imageAlt: z.string(),
  // The "from" price (cheapest active variant), integer cents.
  priceFromCents: z.number().int().min(0),
  currency: z.string().length(3),
});

export const SuggestCategorySchema = z.object({
  slug: z.string(),
  name: z.string(),
  // "Dogs" for "Toys" under Dogs, so two "Toys" entries can be told apart.
  parentName: z.string().nullable(),
});

export const SuggestBrandSchema = z.object({ slug: z.string(), name: z.string() });

export const SuggestionsSchema = z.object({
  products: z.array(SuggestProductSchema),
  categories: z.array(SuggestCategorySchema),
  brands: z.array(SuggestBrandSchema),
});
export type Suggestions = z.infer<typeof SuggestionsSchema>;

export const SuggestResponseSchema = DataSchema(SuggestionsSchema);
