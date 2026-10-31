import {
  FACET_KEYS,
  type Category,
  type CategoryNode,
  type Facets,
  type ProductCard,
  type ProductListQuery,
  type ProductListResponse,
} from '@store/shared';

import { notFound } from '../../lib/errors.ts';

import * as repo from './repo.ts';

function toCategory(row: repo.CategoryRow, productCount = row.productCount): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    accentColor: row.attributes.accentColor ?? null,
    icon: row.attributes.icon ?? null,
    productCount,
  };
}

// A parent's own count is nearly always 0 (products live in leaf categories), so what a shopper
// wants to see next to "Dogs" is the total of its children plus anything attached directly.
function toNode(row: repo.CategoryRow, children: repo.CategoryRow[]): CategoryNode {
  const total = children.reduce((sum, c) => sum + c.productCount, row.productCount);
  return { ...toCategory(row, total), children: children.map((c) => toCategory(c)) };
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const rows = await repo.listCategories();
  return rows
    .filter((r) => r.parentId === null)
    .map((root) =>
      toNode(
        root,
        rows.filter((r) => r.parentId === root.id),
      ),
    );
}

export async function getCategory(slug: string): Promise<CategoryNode> {
  const rows = await repo.getCategoryBySlug(slug);
  const self = rows.find((r) => r.slug === slug);
  if (!self) throw notFound('Category not found');
  return toNode(
    self,
    rows.filter((r) => r.parentId === self.id),
  );
}

// ---------- product list ----------

function toCard(row: repo.ProductCardRow, image: repo.ProductImageRow | undefined): ProductCard {
  // Only the facet keys leave the API on a card: the jsonb may hold internal keys (optionKeys).
  const attributes: ProductCard['attributes'] = {};
  for (const key of FACET_KEYS) {
    const value = row.attributes[key];
    if (value !== undefined) attributes[key] = value;
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    categorySlug: row.categorySlug,
    image: image
      ? {
          id: image.id,
          url: image.url,
          alt: image.alt,
          width: image.width,
          height: image.height,
          variantId: image.variantId,
        }
      : null,
    price: { minCents: row.minCents, maxCents: row.maxCents, currency: row.currency },
    inStock: row.inStock,
    attributes,
  };
}

function toFilters(query: ProductListQuery): repo.ProductFilters {
  return {
    ...(query.q !== undefined && { q: query.q }),
    ...(query.category !== undefined && { category: query.category }),
    ...(query.minPrice !== undefined && { minPriceCents: query.minPrice }),
    ...(query.maxPrice !== undefined && { maxPriceCents: query.maxPrice }),
    ...(query.inStock !== undefined && { inStock: query.inStock }),
    attr: query.attr,
  };
}

async function getFacets(query: ProductListQuery): Promise<Facets> {
  const rows = await repo.getFacets(toFilters(query), FACET_KEYS);
  // Every facet key is present (possibly empty) so the filter UI never has to guess.
  const attributes: Facets['attributes'] = Object.fromEntries(FACET_KEYS.map((key) => [key, []]));
  for (const { key, value, count } of rows.attributes) attributes[key]?.push({ value, count });
  return { attributes, price: rows.price };
}

export async function listProducts(query: ProductListQuery): Promise<ProductListResponse> {
  // `relevance` only means something with a search term; without one it would be an arbitrary
  // order, so it quietly becomes the default.
  const sort = query.sort ?? (query.q ? 'relevance' : 'newest');
  const [{ rows, total }, facets] = await Promise.all([
    repo.listProducts({
      filters: toFilters(query),
      sort,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    }),
    getFacets(query),
  ]);
  const images = await repo.listPrimaryImages(rows.map((r) => r.id));
  const imageByProduct = new Map(images.map((i) => [i.productId, i]));

  return {
    data: rows.map((row) => toCard(row, imageByProduct.get(row.id))),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
    facets,
  };
}
