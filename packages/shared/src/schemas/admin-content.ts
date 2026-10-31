import { z } from 'zod';

import { ImageUrlSchema } from './admin.ts';
import { DataSchema, optionalText, requiredText } from './common.ts';
import { HelpTopicSchema } from './help.ts';
import { SafetySeveritySchema } from './safety.ts';

// Back-office content management: guides, help articles, testimonials, safety notices and the
// editable homepage blocks. (Withdrawals and contact messages live next to their public forms.)

const ContentStatusSchema = z.enum(['draft', 'published']);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;
export { ContentStatusSchema };

const IsoSchema = z.iso.datetime({ offset: true });

// ---------- guides ----------

export const AdminGuideRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  category: z.string(),
  status: ContentStatusSchema,
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type AdminGuideRow = z.infer<typeof AdminGuideRowSchema>;
export const AdminGuideListResponseSchema = DataSchema(z.array(AdminGuideRowSchema));

export const AdminGuideSchema = AdminGuideRowSchema.extend({
  summary: z.string(),
  bodyMd: z.string(),
  coverUrl: z.string().nullable(),
  products: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
});
export type AdminGuide = z.infer<typeof AdminGuideSchema>;
export const AdminGuideResponseSchema = DataSchema(AdminGuideSchema);

export const AdminGuideInputSchema = z.object({
  title: requiredText(160),
  // Empty means "make one from the title".
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'Lowercase letters, numbers and hyphens only')
    .optional(),
  summary: requiredText(300),
  bodyMd: requiredText(50_000),
  // A name; the category is created when it does not exist yet.
  category: requiredText(60),
  coverUrl: ImageUrlSchema.nullish().transform((v) => v ?? null),
  status: ContentStatusSchema,
  // Null on a published guide means "now".
  publishedAt: IsoSchema.nullish().transform((v) => v ?? null),
  productIds: z.array(z.uuid()).max(12).default([]),
});
export type AdminGuideInput = z.input<typeof AdminGuideInputSchema>;

// ---------- help articles ----------

export const AdminHelpArticleSchema = z.object({
  id: z.string(),
  slug: z.string(),
  topic: HelpTopicSchema,
  question: z.string(),
  answerMd: z.string(),
  status: ContentStatusSchema,
  sortOrder: z.number().int(),
  updatedAt: z.string(),
});
export type AdminHelpArticle = z.infer<typeof AdminHelpArticleSchema>;
export const AdminHelpListResponseSchema = DataSchema(z.array(AdminHelpArticleSchema));
export const AdminHelpResponseSchema = DataSchema(AdminHelpArticleSchema);

export const AdminHelpInputSchema = z.object({
  slug: AdminGuideInputSchema.shape.slug,
  topic: HelpTopicSchema,
  question: requiredText(200),
  answerMd: requiredText(10_000),
  status: ContentStatusSchema.default('published'),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});
export type AdminHelpInput = z.input<typeof AdminHelpInputSchema>;

// ---------- testimonials ----------

export const AdminTestimonialSchema = z.object({
  id: z.string(),
  name: z.string(),
  pet: z.string(),
  rating: z.number().int().min(1).max(5),
  quote: z.string(),
  isFeatured: z.boolean(),
});
export type AdminTestimonial = z.infer<typeof AdminTestimonialSchema>;
export const AdminTestimonialListResponseSchema = DataSchema(z.array(AdminTestimonialSchema));
export const AdminTestimonialResponseSchema = DataSchema(AdminTestimonialSchema);

export const AdminTestimonialInputSchema = z.object({
  name: requiredText(80),
  pet: requiredText(80),
  rating: z.number().int().min(1).max(5),
  quote: requiredText(400),
  isFeatured: z.boolean().default(false),
});
export type AdminTestimonialInput = z.input<typeof AdminTestimonialInputSchema>;

// ---------- safety notices ----------

export const AdminSafetyNoticeSchema = z.object({
  id: z.string(),
  title: z.string(),
  bodyMd: z.string(),
  severity: SafetySeveritySchema,
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  status: ContentStatusSchema,
  // True while the public can see it (published, started, not ended).
  isActive: z.boolean(),
  // How many buyers have been emailed so far.
  deliveryCount: z.number().int().min(0),
  variants: z.array(
    z.object({ id: z.string(), sku: z.string(), name: z.string(), productName: z.string() }),
  ),
});
export type AdminSafetyNotice = z.infer<typeof AdminSafetyNoticeSchema>;
export const AdminSafetyListResponseSchema = DataSchema(z.array(AdminSafetyNoticeSchema));
export const AdminSafetyResponseSchema = DataSchema(AdminSafetyNoticeSchema);

export const AdminSafetyInputSchema = z.object({
  title: requiredText(160),
  bodyMd: requiredText(5_000),
  severity: SafetySeveritySchema,
  startsAt: IsoSchema.nullish().transform((v) => v ?? null),
  endsAt: IsoSchema.nullish().transform((v) => v ?? null),
  status: ContentStatusSchema,
  variantIds: z.array(z.uuid()).max(100).default([]),
});
export type AdminSafetyInput = z.input<typeof AdminSafetyInputSchema>;

export const AdminSafetyNotifyResponseSchema = DataSchema(
  z.object({ queued: z.number().int(), alreadyNotified: z.number().int() }),
);
export type AdminSafetyNotifyResult = z.infer<typeof AdminSafetyNotifyResponseSchema>['data'];

// ---------- homepage blocks ----------

export const HERO_SLIDE_COUNT = 3;

export const HeroSlideSchema = z.object({
  title: requiredText(80),
  text: requiredText(200),
  ctaLabel: requiredText(30),
  // A path inside the shop ("/c/dogs") or an https URL.
  ctaHref: z
    .string()
    .trim()
    .max(300)
    .refine((v) => (v.startsWith('/') && !v.startsWith('//')) || v.startsWith('https://'), {
      message: 'A path starting with / or an https:// link',
    }),
  imageUrl: ImageUrlSchema.nullish().transform((v) => v ?? null),
});
export type HeroSlide = z.infer<typeof HeroSlideSchema>;
export const HeroSlidesSchema = z.array(HeroSlideSchema).min(1).max(HERO_SLIDE_COUNT);

export const PromoTileSchema = z.object({
  enabled: z.boolean(),
  text: optionalText(160).transform((v) => v ?? null),
  linkLabel: optionalText(30).transform((v) => v ?? null),
  linkHref: HeroSlideSchema.shape.ctaHref.nullish().transform((v) => v ?? null),
});
export type PromoTile = z.infer<typeof PromoTileSchema>;

export const HOME_CONTENT_KEYS = ['hero_slides', 'promo_tile'] as const;
export const HomeContentKeySchema = z.enum(HOME_CONTENT_KEYS);
export type HomeContentKey = z.infer<typeof HomeContentKeySchema>;

export const AdminHomeContentSchema = z.object({
  heroSlides: HeroSlidesSchema,
  promoTile: PromoTileSchema,
});
export type AdminHomeContent = z.infer<typeof AdminHomeContentSchema>;
export const AdminHomeContentResponseSchema = DataSchema(AdminHomeContentSchema);

export const AdminHomeContentParamsSchema = z.object({ key: HomeContentKeySchema });
export const AdminHomeContentPutSchema = z.object({ value: z.unknown() });
