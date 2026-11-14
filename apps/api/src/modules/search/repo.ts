import { and, asc, eq, or, sql } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { brands, categories, products } from '../../db/schema/index.ts';
import { variantSummary } from '../catalog/repo.ts';
import { currentLang } from '../i18n/context.ts';

// `%` and `_` are wildcards in LIKE; a shopper typing "50%" means the characters.
const likeEscape = (q: string) => q.replace(/[\\%_]/g, '\\$&');

// Lower is better. A name that starts with the input beats one with a word that starts with it,
// which beats a substring hit, which beats a fuzzy (typo) or description-only hit.
function rankOf(column: ReturnType<typeof sql>, q: string) {
  const e = likeEscape(q);
  return sql<number>`(case
    when ${column} ilike ${e + '%'} then 0
    when ${column} ilike ${'% ' + e + '%'} then 1
    when ${column} ilike ${'%' + e + '%'} then 2
    else 3 end)`;
}

export interface SuggestProductRow {
  id: string;
  name: string;
  slug: string;
  minCents: number;
  currency: string;
}

// Active products with something to buy (the same "has an active, non-trial variant" rule as the
// product list, through the shared variant summary), matched three ways: substring (ILIKE, which
// the trigram index serves), typo-tolerant trigram similarity (`%`), and the full-text vector, so
// a word from the description still finds the product, just further down.
export async function suggestProducts(q: string, limit: number): Promise<SuggestProductRow[]> {
  const v = variantSummary();
  const name = sql`${products.name}`;
  const tsq = sql`websearch_to_tsquery('english', ${q})`;
  const rank = rankOf(name, q);
  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      minCents: v.minCents,
      currency: v.currency,
    })
    .from(products)
    .innerJoin(v, eq(v.productId, products.id))
    .where(
      and(
        eq(products.status, 'active'),
        or(
          sql`${products.name} ilike ${'%' + likeEscape(q) + '%'}`,
          sql`${products.name} % ${q}`,
          sql`(numnode(${tsq}) > 0 and ${products.searchVector} @@ ${tsq})`,
          // The translated name of the store view's language (the English name matches above).
          sql`exists (select 1 from product_translations pt where pt.product_id = ${products.id}
            and pt.locale = ${currentLang()} and pt.name ilike ${'%' + likeEscape(q) + '%'})`,
        ),
      ),
    )
    .orderBy(
      rank,
      sql`similarity(${products.name}, ${q}) desc`,
      asc(products.name),
      asc(products.id),
    )
    .limit(limit);
}

export async function suggestCategories(q: string, limit: number) {
  const parent = db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .as('parent');
  return db
    .select({ slug: categories.slug, name: categories.name, parentName: parent.name })
    .from(categories)
    .leftJoin(parent, eq(parent.id, categories.parentId))
    .where(
      or(
        sql`${categories.name} ilike ${'%' + likeEscape(q) + '%'}`,
        sql`${categories.name} % ${q}`,
        sql`exists (select 1 from category_translations ct where ct.category_id = ${categories.id}
          and ct.locale = ${currentLang()} and ct.name ilike ${'%' + likeEscape(q) + '%'})`,
      ),
    )
    .orderBy(rankOf(sql`${categories.name}`, q), asc(categories.name), asc(categories.id))
    .limit(limit);
}

export async function suggestBrands(q: string, limit: number) {
  return db
    .select({ slug: brands.slug, name: brands.name })
    .from(brands)
    .where(
      or(
        sql`${brands.name} ilike ${'%' + likeEscape(q) + '%'}`,
        sql`${brands.name} % ${q}`,
        sql`exists (select 1 from brand_translations bt where bt.brand_id = ${brands.id}
          and bt.locale = ${currentLang()} and bt.name ilike ${'%' + likeEscape(q) + '%'})`,
      ),
    )
    .orderBy(rankOf(sql`${brands.name}`, q), asc(brands.name), asc(brands.id))
    .limit(limit);
}
