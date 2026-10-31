import type { Category, CategoryNode } from '@store/shared';

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
