import {
  AdminReviewListResponseSchema,
  AdminReviewResponseSchema,
  type ReviewStatus,
} from '@store/shared';

import { NoContentSchema } from './auth';
import { apiFetch } from './client';

const id = encodeURIComponent;

export function fetchAdminReviews(status: ReviewStatus, page: number, signal?: AbortSignal) {
  return apiFetch(`/admin/reviews?status=${status}&page=${page}`, {
    schema: AdminReviewListResponseSchema,
    ...(signal && { signal }),
  });
}

export async function approveAdminReview(reviewId: string) {
  return (
    await apiFetch(`/admin/reviews/${id(reviewId)}/approve`, {
      method: 'POST',
      schema: AdminReviewResponseSchema,
    })
  ).data;
}

export async function rejectAdminReview(reviewId: string, reason: string) {
  return (
    await apiFetch(`/admin/reviews/${id(reviewId)}/reject`, {
      method: 'POST',
      body: { reason },
      schema: AdminReviewResponseSchema,
    })
  ).data;
}

export async function deleteAdminReview(reviewId: string): Promise<void> {
  await apiFetch(`/admin/reviews/${id(reviewId)}`, { method: 'DELETE', schema: NoContentSchema });
}
