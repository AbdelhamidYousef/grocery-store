import {
  GuideCategoriesResponseSchema,
  GuideDetailResponseSchema,
  GuideListResponseSchema,
} from '@store/shared';

import { apiFetch } from './client';

export interface GuideListParams {
  category?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export function fetchGuides(params: GuideListParams, signal?: AbortSignal) {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  const text = search.toString();
  return apiFetch(`/guides${text ? `?${text}` : ''}`, {
    schema: GuideListResponseSchema,
    ...(signal && { signal }),
  });
}

export async function fetchGuide(slug: string, signal?: AbortSignal) {
  return (
    await apiFetch(`/guides/${encodeURIComponent(slug)}`, {
      schema: GuideDetailResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function fetchGuideCategories(signal?: AbortSignal) {
  return (
    await apiFetch('/guide-categories', {
      schema: GuideCategoriesResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
