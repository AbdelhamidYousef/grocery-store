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
