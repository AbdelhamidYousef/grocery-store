import {
  readingMinutes,
  type GuideCard,
  type GuideCategory,
  type GuideDetail,
  type GuideListQuery,
  type GuideListResponse,
} from '@store/shared';

import { notFound } from '../../lib/errors.ts';
import * as catalog from '../catalog/service.ts';

import * as repo from './repo.ts';

const RELATED_COUNT = 3;

function toCard(row: repo.GuideCardRow): GuideCard {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverUrl: row.coverUrl,
    category: { slug: row.categorySlug, name: row.categoryName },
    // Visible guides always have a date (the visibility rule compares it with now()).
    publishedAt: (row.publishedAt ?? new Date(0)).toISOString(),
    readingMinutes: readingMinutes(row.words),
  };
}

export async function listCategories(): Promise<GuideCategory[]> {
  const rows = await repo.listCategories();
  return rows.filter((r) => r.guideCount > 0);
}

export async function listGuides(query: GuideListQuery): Promise<GuideListResponse> {
  const { rows, total } = await repo.listGuides({
    category: query.category,
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
  });
  return {
    data: rows.map(toCard),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getGuide(slug: string): Promise<GuideDetail> {
  const guide = await repo.findGuideBySlug(slug);
  // Unknown, draft and not-yet-published guides all look the same from outside: 404.
  if (!guide) throw notFound('Guide not found');
  const [productIds, related] = await Promise.all([
    repo.listProductIds(guide.id),
    repo.listRelated(guide, RELATED_COUNT),
  ]);
  return {
    ...toCard(guide),
    bodyMd: guide.bodyMd,
    products: await catalog.listCardsByIds(productIds),
    related: related.map(toCard),
  };
}
