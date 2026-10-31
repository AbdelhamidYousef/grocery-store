import {
  FACET_KEYS,
  badgeFromSlug,
  badgeSlug,
  unitPriceCents,
  type Badge,
  type Category,
  type CategoryNode,
  type Facets,
  type ProductDetail,
  type ProductCard,
  type ProductListQuery,
  type ProductListResponse,
} from '@store/shared';

import { notFound } from '../../lib/errors.ts';

import { getBadgeIndex, type BadgeIndex } from './badge-index.ts';
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

function toCard(
  row: repo.ProductCardRow,
  image: repo.ProductImageRow | undefined,
  badges: Badge[],
  swatches: ProductCard['swatches'],
): ProductCard {
  // Only the facet keys leave the API on a card: the jsonb may hold internal keys (optionKeys).
  const attributes: ProductCard['attributes'] = {};
  for (const key of FACET_KEYS) {
    const value = row.attributes[key];
    if (value !== undefined) attributes[key] = value;
  }
  // The brand name lives in its own table now; the card keeps showing it as an attribute.
  if (row.brandName) attributes.brand = row.brandName;
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
    brand: row.brandSlug && row.brandName ? { slug: row.brandSlug, name: row.brandName } : null,
    badges,
    unitPrice:
      row.unitCents !== null && row.unitPer !== null
        ? { cents: row.unitCents, per: row.unitPer === 'g' ? 'kg' : 'L' }
        : null,
    swatches,
  };
}

// The badge filter needs ids, and badges are derived in code (one source of truth), so the filter
// is resolved against the cached index first and handed to SQL as a list of product ids.
function badgeProductIds(query: ProductListQuery, index: BadgeIndex): string[] | undefined {
  if (!query.badge) return undefined;
  const wanted = new Set(query.badge.map(badgeFromSlug));
  return [...index].filter(([, badges]) => badges.some((b) => wanted.has(b))).map(([id]) => id);
}

function toFilters(query: ProductListQuery, index: BadgeIndex): repo.ProductFilters {
  const badgeIds = badgeProductIds(query, index);
  return {
    ...(query.q !== undefined && { q: query.q }),
    ...(query.category !== undefined && { category: query.category }),
    ...(query.minPrice !== undefined && { minPriceCents: query.minPrice }),
    ...(query.maxPrice !== undefined && { maxPriceCents: query.maxPrice }),
    ...(query.inStock !== undefined && { inStock: query.inStock }),
    ...(query.brand !== undefined && { brand: query.brand }),
    ...(query.tag !== undefined && { tag: query.tag }),
    ...(query.collection !== undefined && { collection: query.collection }),
    ...(badgeIds !== undefined && { badgeProductIds: badgeIds }),
    attr: query.attr,
  };
}

async function getFacets(query: ProductListQuery, index: BadgeIndex): Promise<Facets> {
  const rows = await repo.getFacets(toFilters(query, index), FACET_KEYS);
  // Every facet key is present (possibly empty) so the filter UI never has to guess.
  const attributes: Facets['attributes'] = Object.fromEntries(FACET_KEYS.map((key) => [key, []]));
  for (const { key, value, count } of rows.attributes) attributes[key]?.push({ value, count });

  // Badge counts: how many products in the scope carry each badge, from the same index.
  const badgeCounts = new Map<Badge, number>();
  for (const id of rows.scopeProductIds)
    for (const badge of index.get(id) ?? [])
      badgeCounts.set(badge, (badgeCounts.get(badge) ?? 0) + 1);

  return {
    attributes,
    brand: rows.brand.map((b) => ({ value: b.slug, label: b.name, count: b.count })),
    tag: rows.tag.map((t) => ({ value: t.slug, label: t.name, count: t.count })),
    badge: [...badgeCounts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([badge, count]) => ({ value: badgeSlug(badge), label: badge, count })),
    price: rows.price,
  };
}

export async function listProducts(query: ProductListQuery): Promise<ProductListResponse> {
  // `relevance` only means something with a search term; without one it would be an arbitrary
  // order, so it quietly becomes the default.
  // Inside a collection the editor's order is the default, otherwise newest first.
  const sort = query.sort ?? (query.q ? 'relevance' : query.collection ? 'collection' : 'newest');
  const index = await getBadgeIndex();
  const [{ rows, total }, facets] = await Promise.all([
    repo.listProducts({
      filters: toFilters(query, index),
      sort,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    }),
    getFacets(query, index),
  ]);
  const ids = rows.map((r) => r.id);
  const [images, swatchRows] = await Promise.all([
    repo.listPrimaryImages(ids),
    repo.listSwatches(ids),
  ]);
  const imageByProduct = new Map(images.map((i) => [i.productId, i]));
  const swatchesByProduct = new Map<string, ProductCard['swatches']>();
  for (const s of swatchRows) {
    const list = swatchesByProduct.get(s.productId) ?? [];
    list.push({
      color: s.color,
      hex: s.hex,
      image:
        s.imageId && s.imageUrl
          ? {
              id: s.imageId,
              url: s.imageUrl,
              alt: s.imageAlt ?? '',
              width: s.imageWidth ?? 1200,
              height: s.imageHeight ?? 1200,
              variantId: s.imageVariantId,
            }
          : null,
    });
    swatchesByProduct.set(s.productId, list);
  }

  return {
    data: rows.map((row) =>
      toCard(
        row,
        imageByProduct.get(row.id),
        index.get(row.id) ?? [],
        swatchesByProduct.get(row.id) ?? [],
      ),
    ),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
    facets,
  };
}

// ---------- product detail ----------

export async function getProduct(slug: string): Promise<ProductDetail> {
  const rows = await repo.getProductBySlug(slug);
  // A product with no active variant cannot be bought, so it is as good as missing (the list
  // hides it for the same reason).
  if (!rows || rows.variants.length === 0) throw notFound('Product not found');

  const variants = rows.variants.map((v) => {
    const availableUnits = v.quantity - v.reserved;
    return {
      id: v.id,
      sku: v.sku,
      name: v.name,
      options: v.options,
      priceCents: v.priceCents,
      compareAtPriceCents: v.compareAtPriceCents,
      currency: v.currency,
      isDefault: v.isDefault,
      // Booleans only: the exact stock level is not for the public.
      available: availableUnits > 0,
      lowStock: availableUnits > 0 && availableUnits <= v.lowStockThreshold,
      netAmount: v.netAmount,
      netUnit: v.netUnit,
      unitPrice: unitPriceCents(v.priceCents, v.netAmount, v.netUnit),
      isTrial: v.isTrial,
      swatchHex: v.swatchHex,
    };
  });
  // A sample size must not set the "from" price of the product.
  const sellable = variants.filter((v) => !v.isTrial);
  const prices = (sellable.length > 0 ? sellable : variants).map((v) => v.priceCents);
  const { optionKeys = [], ...publicAttributes } = rows.product.attributes;
  const attributes = { ...publicAttributes, ...(rows.brand && { brand: rows.brand.name }) };
  const badges = (await getBadgeIndex()).get(rows.product.id) ?? [];

  return {
    id: rows.product.id,
    slug: rows.product.slug,
    name: rows.product.name,
    description: rows.product.description,
    category: rows.category,
    breadcrumb: rows.parent ? [rows.parent, rows.category] : [rows.category],
    attributes,
    brand: rows.brand,
    tags: rows.tags,
    badges,
    optionKeys,
    price: {
      minCents: Math.min(...prices),
      maxCents: Math.max(...prices),
      currency: variants[0]?.currency ?? 'EUR',
    },
    inStock: variants.some((v) => v.available),
    variants,
    images: rows.images.map((i) => ({
      id: i.id,
      url: i.url,
      alt: i.alt,
      width: i.width,
      height: i.height,
      variantId: i.variantId,
    })),
  };
}
