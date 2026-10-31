import { and, count, desc, eq, lte, ne, sql } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { guideCategories, guideProducts, guides } from '../../db/schema/index.ts';

// "Visible to the public": published AND already past its publish date, so a guide can be
// scheduled by giving it a future date. Drafts never leave the admin.
const visible = and(eq(guides.status, 'published'), lte(guides.publishedAt, sql`now()`));

// Word count in SQL so the list does not ship every body just to show "4 min read".
const wordCount = sql<number>`coalesce(array_length(regexp_split_to_array(btrim(${guides.bodyMd}), '\\s+'), 1), 0)::int`;

const cardColumns = {
  slug: guides.slug,
  title: guides.title,
  summary: guides.summary,
  coverUrl: guides.coverUrl,
  publishedAt: guides.publishedAt,
  categorySlug: guideCategories.slug,
  categoryName: guideCategories.name,
  words: wordCount,
};
export type GuideCardRow = {
  slug: string;
  title: string;
  summary: string;
  coverUrl: string | null;
  publishedAt: Date | null;
  categorySlug: string;
  categoryName: string;
  words: number;
};

export async function listCategories() {
  return db
    .select({
      slug: guideCategories.slug,
      name: guideCategories.name,
      // Count only what the public can see, so a category of drafts shows 0 and is dropped.
      guideCount: count(guides.id),
    })
    .from(guideCategories)
    .leftJoin(guides, and(eq(guides.categoryId, guideCategories.id), visible))
    .groupBy(guideCategories.id)
    .orderBy(guideCategories.sortOrder, guideCategories.name);
}

export async function listGuides(opts: {
  category?: string | undefined;
  limit: number;
  offset: number;
}): Promise<{ rows: GuideCardRow[]; total: number }> {
  const where = and(visible, opts.category ? eq(guideCategories.slug, opts.category) : undefined);
  // `guides.id` last: a unique tiebreak keeps pages stable when two guides share a date.
  const rows = await db
    .select(cardColumns)
    .from(guides)
    .innerJoin(guideCategories, eq(guideCategories.id, guides.categoryId))
    .where(where)
    .orderBy(desc(guides.publishedAt), guides.id)
    .limit(opts.limit)
    .offset(opts.offset);
  const [totalRow] = await db
    .select({ total: count() })
    .from(guides)
    .innerJoin(guideCategories, eq(guideCategories.id, guides.categoryId))
    .where(where);
  return { rows, total: totalRow?.total ?? 0 };
}

export async function findGuideBySlug(slug: string) {
  const [row] = await db
    .select({ id: guides.id, categoryId: guides.categoryId, bodyMd: guides.bodyMd, ...cardColumns })
    .from(guides)
    .innerJoin(guideCategories, eq(guideCategories.id, guides.categoryId))
    .where(and(eq(guides.slug, slug), visible));
  return row;
}

export async function listProductIds(guideId: string): Promise<string[]> {
  const rows = await db
    .select({ productId: guideProducts.productId })
    .from(guideProducts)
    .where(eq(guideProducts.guideId, guideId));
  return rows.map((r) => r.productId);
}

// Same category first, then the newest of the rest: one ordering, so a category with fewer than
// `limit` other guides is topped up instead of showing a short list. Never the guide itself.
export async function listRelated(guide: { id: string; categoryId: string }, limit: number) {
  return db
    .select(cardColumns)
    .from(guides)
    .innerJoin(guideCategories, eq(guideCategories.id, guides.categoryId))
    .where(and(visible, ne(guides.id, guide.id)))
    .orderBy(
      desc(sql`${guides.categoryId} = ${guide.categoryId}`),
      desc(guides.publishedAt),
      guides.id,
    )
    .limit(limit);
}
