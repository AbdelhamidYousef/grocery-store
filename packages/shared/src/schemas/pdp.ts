import { z } from 'zod';

// Structured product-page content as the public API serves it (phase 16). Basis points and grams
// are integers end to end; the web formats them.

export const CONSTITUENT_KEYS = ['protein', 'fat', 'fibre', 'ash', 'moisture', 'kcal'] as const;
export const ConstituentKeySchema = z.enum(CONSTITUENT_KEYS);
export type ConstituentKey = z.infer<typeof ConstituentKeySchema>;

// protein 2650 = 26.50 %; for `kcal` the number is plain kcal per 100 g.
export const ConstituentSchema = z.object({
  key: ConstituentKeySchema,
  valueBp: z.number().int().min(0).max(10_000),
});
export type Constituent = z.infer<typeof ConstituentSchema>;

export const SpecSchema = z.object({ label: z.string(), value: z.string() });
export type Spec = z.infer<typeof SpecSchema>;

export const FaqSchema = z.object({ id: z.string(), question: z.string(), answer: z.string() });
export type Faq = z.infer<typeof FaqSchema>;

// `size` is the option value a variant carries ("M"), which is how the modal finds its row.
export const SizeGuideTableSchema = z.object({
  columns: z.array(z.string().min(1).max(40)).min(1).max(8),
  rows: z
    .array(
      z.object({
        size: z.string().min(1).max(40),
        label: z.string().min(1).max(60),
        values: z.array(z.string().max(60)).max(8),
      }),
    )
    .min(1)
    .max(20),
});
export type SizeGuideTable = z.infer<typeof SizeGuideTableSchema>;

export const SizeGuideSchema = z.object({
  slug: z.string(),
  title: z.string(),
  columns: SizeGuideTableSchema.shape.columns,
  rows: SizeGuideTableSchema.shape.rows,
  howtoMd: z.string(),
  tip: z.string().nullable(),
});
export type SizeGuide = z.infer<typeof SizeGuideSchema>;
