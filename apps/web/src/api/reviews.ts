import {
  GalleryResponseSchema,
  HelpfulResponseSchema,
  ReviewCreatedResponseSchema,
  ReviewListResponseSchema,
  type ReviewListResponse,
} from '@store/shared';

import { apiFetch } from './client';

export interface ReviewListParams {
  sort?: 'helpful' | 'newest' | 'photos' | undefined;
  rating?: number | undefined;
  topic?: string | undefined;
  page?: number | undefined;
}

export async function fetchReviews(
  slug: string,
  params: ReviewListParams,
  signal?: AbortSignal,
): Promise<ReviewListResponse> {
  const q = new URLSearchParams();
  if (params.sort) q.set('sort', params.sort);
  if (params.rating) q.set('rating', String(params.rating));
  if (params.topic) q.set('topic', params.topic);
  if (params.page && params.page > 1) q.set('page', String(params.page));
  const qs = q.toString();
  return apiFetch(`/products/${encodeURIComponent(slug)}/reviews${qs ? `?${qs}` : ''}`, {
    schema: ReviewListResponseSchema,
    ...(signal && { signal }),
  });
}

// Multipart: the text fields plus up to three `photos` files.
export async function submitReview(slug: string, form: FormData) {
  return (
    await apiFetch(`/products/${encodeURIComponent(slug)}/reviews`, {
      method: 'POST',
      body: form,
      schema: ReviewCreatedResponseSchema,
    })
  ).data;
}

export async function toggleHelpful(reviewId: string) {
  return (
    await apiFetch(`/reviews/${encodeURIComponent(reviewId)}/helpful`, {
      method: 'POST',
      schema: HelpfulResponseSchema,
    })
  ).data;
}

export async function fetchGallery(productId?: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/gallery${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`, {
      schema: GalleryResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
