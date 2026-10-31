import {
  ErrorCode,
  type AdminBrandInput,
  type AdminBrandUpdate,
  type AdminCollection,
  type AdminCollectionInput,
  type AdminCollectionUpdate,
  type AdminTagInput,
  type Brand,
  type Collection,
  type Tag,
} from '@store/shared';

import { db } from '../../db/client.ts';
import { uniqueViolation } from '../../lib/db-errors.ts';
import { conflict, notFound, validation } from '../../lib/errors.ts';

import * as repo from './repo.ts';

const fieldError = (field: string, message: string) =>
  validation({ formErrors: [], fieldErrors: { [field]: [message] } });

// A duplicate slug can come from the check-then-insert race of two admins; map it to the same
// friendly 409 instead of a 500.
function mapSlugConflict<T>(what: string, work: () => Promise<T>): Promise<T> {
  return work().catch((err: unknown) => {
    if (uniqueViolation(err) !== undefined) {
      throw conflict(ErrorCode.CONFLICT, `That slug is already used by another ${what}`);
    }
    throw err;
  });
}

// ---------- mapping ----------

const toBrand = (r: repo.BrandRow & { productCount: number }): Brand => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  tagline: r.tagline,
  story: r.story,
  accentColor: r.accentColor,
  logoUrl: r.logoUrl,
  productCount: r.productCount,
});

const toCollection = (r: repo.CollectionRow & { productCount: number }): Collection => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  accentColor: r.accentColor,
  startsAt: r.startsAt?.toISOString() ?? null,
  endsAt: r.endsAt?.toISOString() ?? null,
  productCount: r.productCount,
});

// "Live": switched on and inside the window (either end may be open). The SQL twin of this lives
// in catalog/repo.ts (`liveCollection`) and the two are tested against each other.
export function isLive(
  c: Pick<repo.CollectionRow, 'isActive' | 'startsAt' | 'endsAt'>,
  now = new Date(),
): boolean {
  return (
    c.isActive &&
    (c.startsAt === null || c.startsAt <= now) &&
    (c.endsAt === null || c.endsAt > now)
  );
}

// ---------- public ----------

export async function listBrands(): Promise<Brand[]> {
  return (await repo.listBrands()).map(toBrand);
}

export async function getBrand(slug: string): Promise<Brand> {
  const row = await repo.findBrandBySlug(slug);
  if (!row) throw notFound('Brand not found');
  return toBrand(row);
}

export async function listLiveCollections(): Promise<Collection[]> {
  return (await repo.listCollectionRows()).filter((c) => isLive(c)).map(toCollection);
}

// A collection outside its window is indistinguishable from a missing one.
export async function getLiveCollection(slug: string): Promise<Collection> {
  const row = (await repo.listCollectionRows()).find((c) => c.slug === slug);
  if (!row || !isLive(row)) throw notFound('Collection not found');
  return toCollection(row);
}

export async function listTags(): Promise<Tag[]> {
  return (await repo.listTags()).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    productCount: t.productCount,
  }));
}

// ---------- admin: brands ----------

export const adminListBrands = listBrands;

export async function adminGetBrand(id: string): Promise<Brand> {
  const row = await repo.findBrand(db, id);
  if (!row) throw notFound('Brand not found');
  return getBrand(row.slug);
}

export async function createBrand(input: AdminBrandInput & { slug: string }): Promise<Brand> {
  const parsed = { ...input, tagline: input.tagline ?? '', story: input.story ?? '' };
  const row = await mapSlugConflict('brand', () =>
    repo.insertBrand({
      slug: parsed.slug,
      name: parsed.name,
      tagline: parsed.tagline,
      story: parsed.story,
      ...(parsed.accentColor !== undefined && { accentColor: parsed.accentColor }),
      logoUrl: parsed.logoUrl ?? null,
    }),
  );
  return getBrand(row.slug);
}

export async function updateBrand(id: string, input: AdminBrandUpdate): Promise<Brand> {
  const existing = await repo.findBrand(db, id);
  if (!existing) throw notFound('Brand not found');
  await repo.updateBrand(id, {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.tagline !== undefined && { tagline: input.tagline }),
    ...(input.story !== undefined && { story: input.story }),
    ...(input.accentColor !== undefined && { accentColor: input.accentColor }),
    ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl ?? null }),
    updatedAt: new Date(),
  });
  return getBrand(existing.slug);
}

export async function deleteBrand(id: string): Promise<void> {
  if (!(await repo.findBrand(db, id))) throw notFound('Brand not found');
  await repo.deleteBrand(id);
}

// ---------- admin: collections ----------

async function toAdminCollection(
  r: repo.CollectionRow & { productCount: number },
): Promise<AdminCollection> {
  return {
    ...toCollection(r),
    isActive: r.isActive,
    sortOrder: r.sortOrder,
    isLive: isLive(r),
    productIds: await repo.listCollectionProductIds(r.id),
  };
}

export async function adminListCollections(): Promise<AdminCollection[]> {
  return Promise.all((await repo.listCollectionRows()).map(toAdminCollection));
}

export async function adminGetCollection(id: string): Promise<AdminCollection> {
  const row = (await repo.listCollectionRows()).find((c) => c.id === id);
  if (!row) throw notFound('Collection not found');
  return toAdminCollection(row);
}

const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

export async function createCollection(
  input: AdminCollectionInput & { slug: string; name: string },
): Promise<AdminCollection> {
  const row = await mapSlugConflict('collection', () =>
    repo.insertCollection({
      slug: input.slug,
      name: input.name,
      description: input.description ?? '',
      ...(input.accentColor !== undefined && { accentColor: input.accentColor }),
      startsAt: toDate(input.startsAt),
      endsAt: toDate(input.endsAt),
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    }),
  );
  return adminGetCollection(row.id);
}

export async function updateCollection(
  id: string,
  input: AdminCollectionUpdate,
): Promise<AdminCollection> {
  const existing = await repo.findCollection(db, id);
  if (!existing) throw notFound('Collection not found');
  // The window is checked against the stored half too: moving only the end before the old start
  // must fail here, not as a database check error.
  const startsAt = input.startsAt === undefined ? existing.startsAt : toDate(input.startsAt);
  const endsAt = input.endsAt === undefined ? existing.endsAt : toDate(input.endsAt);
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw fieldError('endsAt', 'The end must be after the start');
  }
  await repo.updateCollection(id, {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.accentColor !== undefined && { accentColor: input.accentColor }),
    ...(input.startsAt !== undefined && { startsAt }),
    ...(input.endsAt !== undefined && { endsAt }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    updatedAt: new Date(),
  });
  return adminGetCollection(id);
}

export async function deleteCollection(id: string): Promise<void> {
  if (!(await repo.findCollection(db, id))) throw notFound('Collection not found');
  await repo.deleteCollection(id);
}

export async function setCollectionProducts(
  id: string,
  productIds: string[],
): Promise<AdminCollection> {
  await db.transaction(async (tx) => {
    if (!(await repo.findCollection(tx, id))) throw notFound('Collection not found');
    if ((await repo.countExistingProducts(tx, productIds)) !== productIds.length) {
      throw fieldError('productIds', 'Unknown product in the list');
    }
    await repo.replaceCollectionProducts(tx, id, productIds);
  });
  return adminGetCollection(id);
}

// ---------- admin: tags ----------

export const adminListTags = listTags;

export async function createTag(input: AdminTagInput): Promise<Tag> {
  const row = await mapSlugConflict('tag', () => repo.insertTag(input));
  return { id: row.id, slug: row.slug, name: row.name, productCount: 0 };
}

export async function renameTag(id: string, name: string): Promise<Tag> {
  if (!(await repo.updateTag(id, name))) throw notFound('Tag not found');
  const tag = (await repo.listTags()).find((t) => t.id === id);
  if (!tag) throw notFound('Tag not found');
  return { id: tag.id, slug: tag.slug, name: tag.name, productCount: tag.productCount };
}

export async function deleteTag(id: string): Promise<void> {
  if (!(await repo.deleteTag(id))) throw notFound('Tag not found');
}

export async function setProductTags(productId: string, tagIds: string[]) {
  await db.transaction(async (tx) => {
    if (!(await repo.productExists(tx, productId))) throw notFound('Product not found');
    if ((await repo.countExistingTags(tx, tagIds)) !== tagIds.length) {
      throw fieldError('tagIds', 'Unknown tag in the list');
    }
    await repo.replaceProductTags(tx, productId, tagIds);
  });
  return repo.listProductTags(productId);
}
