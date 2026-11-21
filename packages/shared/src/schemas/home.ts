import { z } from 'zod';

import { HeroSlidesSchema, PromoTileSchema } from './admin-content.ts';
import { ProductCardSchema } from './catalog.ts';
import { DataSchema } from './common.ts';

// GET /home: everything the homepage needs from one place in a single call. The promo tile is null
// unless it is switched on and has text, so the web never has to re-check "is it really usable".
export const HOME_BESTSELLER_COUNT = 4;

export const HomeResponseSchema = DataSchema(
  z.object({
    heroSlides: HeroSlidesSchema,
    promoTile: PromoTileSchema.nullable(),
    bestsellers: z.array(ProductCardSchema),
  }),
);
export type HomeResponse = z.infer<typeof HomeResponseSchema>['data'];

// GET /testimonials: the featured quotes plus the rating over all of them.
export const TestimonialSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Where the customer lives (a Berlin district), shown under the name.
  area: z.string(),
  rating: z.number().int().min(1).max(5),
  quote: z.string(),
});
export type Testimonial = z.infer<typeof TestimonialSchema>;

export const TestimonialsResponseSchema = z.object({
  data: z.array(TestimonialSchema),
  meta: z.object({
    count: z.number().int().min(0),
    // One decimal (4.7); null when there are no testimonials.
    average: z.number().min(1).max(5).nullable(),
  }),
});
export type TestimonialsResponse = z.infer<typeof TestimonialsResponseSchema>;
