import {
  DEPARTMENTS,
  type AdminMenuPromo,
  type AdminMenuPromoInputSchema,
  type AdminMenuPromoUpdateSchema,
  type NavDepartment,
  type Navigation,
} from '@store/shared';
import type { z } from 'zod';

import { notFound, validation } from '../../lib/errors.ts';
import * as catalogService from '../catalog/service.ts';

import * as repo from './repo.ts';

const MAX_BRANDS = 8;

const toAdminPromo = (row: repo.MenuPromoRow): AdminMenuPromo => ({
  id: row.id,
  categoryId: row.categoryId,
  title: row.title,
  subtitle: row.subtitle,
  imageUrl: row.imageUrl,
  imageAlt: row.imageAlt,
  link: row.link,
  sortOrder: row.sortOrder,
  active: row.active,
});

// One call builds the whole menu: the category tree, the brands per department and the promos.
// Nothing in it depends on who is looking, so it is cached publicly (see the router). A department
// whose top-level category does not exist (a trimmed-down catalogue) simply has no panel.
export async function getNavigation(): Promise<Navigation> {
  const [tree, brandRows, promos] = await Promise.all([
    catalogService.getCategoryTree(),
    repo.brandsByDepartment(),
    repo.listActivePromos(),
  ]);
  const departments: NavDepartment[] = [];
  for (const { slug } of DEPARTMENTS) {
    const root = tree.find((c) => c.slug === slug);
    if (!root) continue;
    // The department's own promo first, else the first "any department" promo, in the editor's order.
    const promo =
      promos.find((p) => p.categoryId === root.id) ?? promos.find((p) => p.categoryId === null);
    departments.push({
      slug: root.slug,
      name: root.name,
      categories: root.children.map((c) => ({
        slug: c.slug,
        name: c.name,
        productCount: c.productCount,
      })),
      brands: brandRows
        .filter((b) => b.department === slug)
        .slice(0, MAX_BRANDS)
        .map((b) => ({ slug: b.slug, name: b.name })),
      promo: promo
        ? {
            title: promo.title,
            subtitle: promo.subtitle,
            imageUrl: promo.imageUrl,
            imageAlt: promo.imageAlt,
            link: promo.link,
          }
        : null,
    });
  }
  return { departments };
}

// ---------- admin ----------

export async function adminListPromos(): Promise<AdminMenuPromo[]> {
  return (await repo.listPromos()).map(toAdminPromo);
}

const fieldError = (field: string, message: string) =>
  validation({ formErrors: [], fieldErrors: { [field]: [message] } });

async function assertDepartment(categoryId: string | null | undefined): Promise<void> {
  if (categoryId && !(await repo.departmentExists(categoryId))) {
    throw fieldError('categoryId', 'Choose a department (a top-level category)');
  }
}

export async function createPromo(
  input: z.output<typeof AdminMenuPromoInputSchema>,
): Promise<AdminMenuPromo> {
  await assertDepartment(input.categoryId);
  // New promos go to the end of the list unless the editor says where.
  const sortOrder = input.sortOrder ?? (await repo.nextSortOrder());
  return toAdminPromo(await repo.insertPromo({ ...input, sortOrder }));
}

export async function updatePromo(
  id: string,
  input: z.output<typeof AdminMenuPromoUpdateSchema>,
): Promise<AdminMenuPromo> {
  if (input.categoryId) await assertDepartment(input.categoryId);
  const row = await repo.updatePromo(id, input);
  if (!row) throw notFound('Menu promo not found');
  return toAdminPromo(row);
}

export async function deletePromo(id: string): Promise<void> {
  if (!(await repo.deletePromo(id))) throw notFound('Menu promo not found');
}
