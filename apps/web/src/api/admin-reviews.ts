import {
  AdminGalleryListResponseSchema,
  AdminGalleryResponseSchema,
  AdminReviewListResponseSchema,
  AdminReviewResponseSchema,
  type ReviewStatus,
} from '@store/shared';
import { z } from 'zod';

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

// ---------- gallery ----------

export interface GalleryInput {
  path: string;
  caption: string;
  petName: string;
  sortOrder: number;
  published: boolean;
  productIds: string[];
}

export async function fetchAdminGallery(signal?: AbortSignal) {
  return (
    await apiFetch('/admin/gallery', {
      schema: AdminGalleryListResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function createAdminGalleryPhoto(input: GalleryInput) {
  return (
    await apiFetch('/admin/gallery', {
      method: 'POST',
      body: input,
      schema: AdminGalleryResponseSchema,
    })
  ).data;
}

export async function updateAdminGalleryPhoto(photoId: string, input: Partial<GalleryInput>) {
  return (
    await apiFetch(`/admin/gallery/${id(photoId)}`, {
      method: 'PATCH',
      body: input,
      schema: AdminGalleryResponseSchema,
    })
  ).data;
}

export async function deleteAdminGalleryPhoto(photoId: string): Promise<void> {
  await apiFetch(`/admin/gallery/${id(photoId)}`, { method: 'DELETE', schema: NoContentSchema });
}

// Uploads the file through the same pipeline as review photos and answers the stored path.
export async function uploadAdminGalleryFile(file: File): Promise<string> {
  const form = new FormData();
  form.set('photo', file);
  const res = await apiFetch('/admin/gallery/upload', {
    method: 'POST',
    body: form,
    schema: z.object({ data: z.object({ path: z.string() }) }),
  });
  return res.data.path;
}
