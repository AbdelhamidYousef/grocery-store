import { z } from 'zod';

import { DataSchema, PaginationMetaSchema } from './common.ts';

// Customer reviews (phase 17). No floats cross the wire.

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const ReviewStatusSchema = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const MAX_REVIEW_PHOTOS = 3;
export const MAX_REVIEW_PHOTO_BYTES = 3 * 1024 * 1024;

export const reviewInputSchema = z.object({
  rating: z.coerce.number('Choose a star rating').int().min(1, 'Choose a star rating').max(5),
  title: z
    .string()
    .trim()
    .min(3, 'Give your review a short title')
    .max(80, 'At most 80 characters'),
  body: z
    .string()
    .trim()
    .min(20, 'Please write at least 20 characters')
    .max(2000, 'At most 2000 characters'),
  // Multipart sends booleans as the strings "true"/"false".
  wouldRecommend: z.preprocess(
    (v) => (v === 'true' ? true : v === 'false' ? false : v),
    z.boolean(),
  ),
});
export type ReviewInput = z.output<typeof reviewInputSchema>;

// Average x 10 rounded half up, integers only: floor((sum*10 + count/2) / count) written as
// floor((sum*20 + count) / (2*count)). 0 when there are no ratings (the UI then shows no stars).
export function averageTenths(count: number, sum: number): number {
  return count <= 0 ? 0 : Math.floor((sum * 20 + count) / (count * 2));
}

export const RatingSummarySchema = z.object({
  count: z.number().int().min(0),
  // Average x 10, rounded (46 = 4.6 stars). The UI formats it; 0 when count is 0.
  averageTenths: z.number().int().min(0).max(50),
});
export type RatingSummary = z.infer<typeof RatingSummarySchema>;

export const ReviewPhotoSchema = z.object({ id: z.string(), path: z.string() });

export const ReviewSchema = z.object({
  id: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  body: z.string(),
  verifiedBuyer: z.boolean(),
  authorName: z.string(),
  wouldRecommend: z.boolean(),
  helpfulCount: z.number().int().min(0),
  // Whether the signed-in viewer has voted; false for guests.
  votedHelpful: z.boolean(),
  photos: z.array(ReviewPhotoSchema),
  createdAt: z.string(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const REVIEW_SORTS = ['helpful', 'newest', 'photos'] as const;
export const ReviewListQuerySchema = z.object({
  sort: z.enum(REVIEW_SORTS).default('helpful'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  topic: z.string().trim().min(1).max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const ReviewListResponseSchema = z.object({
  data: z.array(ReviewSchema),
  meta: PaginationMetaSchema,
  summary: z.object({
    rating: RatingSummarySchema,
    // Index 0 is the number of 1-star reviews, index 4 the number of 5-star ones.
    breakdown: z.tuple([
      z.number().int().min(0),
      z.number().int().min(0),
      z.number().int().min(0),
      z.number().int().min(0),
      z.number().int().min(0),
    ]),
    // Whole percent of approved reviews that would recommend; null with no reviews.
    recommendPercent: z.number().int().min(0).max(100).nullable(),
    topics: z.array(z.object({ topic: z.string(), count: z.number().int().min(1) })),
    // Whether the form may offer the photo picker (false on the public demo, see lib/uploads.ts).
    uploadsEnabled: z.boolean(),
  }),
});
export type ReviewListResponse = z.infer<typeof ReviewListResponseSchema>;

export const ReviewCreatedSchema = z.object({
  id: z.string(),
  status: ReviewStatusSchema,
  verifiedBuyer: z.boolean(),
});
export const ReviewCreatedResponseSchema = DataSchema(ReviewCreatedSchema);

export const HelpfulResponseSchema = DataSchema(
  z.object({ helpfulCount: z.number().int().min(0), voted: z.boolean() }),
);

// ---------- admin ----------

export const AdminReviewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  productSlug: z.string(),
  authorName: z.string(),
  authorEmail: z.string().nullable(),
  rating: z.number().int(),
  title: z.string(),
  body: z.string(),
  verifiedBuyer: z.boolean(),
  wouldRecommend: z.boolean(),
  status: ReviewStatusSchema,
  rejectReason: z.string().nullable(),
  photos: z.array(ReviewPhotoSchema),
  createdAt: z.string(),
  moderatedAt: z.string().nullable(),
});
export type AdminReview = z.infer<typeof AdminReviewSchema>;

export const AdminReviewQuerySchema = z.object({
  status: ReviewStatusSchema.default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const AdminReviewListResponseSchema = z.object({
  data: z.array(AdminReviewSchema),
  meta: PaginationMetaSchema,
});
export const AdminReviewResponseSchema = DataSchema(AdminReviewSchema);
export const RejectReviewBodySchema = z.object({ reason: z.string().trim().min(3).max(300) });
