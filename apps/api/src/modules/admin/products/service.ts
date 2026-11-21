import {
  ErrorCode,
  type AdminInventoryResult,
  type AdminInventorySet,
  type AdminProduct,
  type AdminProductRow,
  type AdminVariant,
  type AdminVariantPricesInput,
  STORES,
  estimateCents,
  freshBestBefore,
} from '@store/shared';
import type {
  AdminImageInputSchema,
  AdminProductCreateSchema,
  AdminProductListQuerySchema,
  AdminProductUpdateSchema,
  AdminVariantInputSchema,
  AdminVariantUpdateSchema,
} from '@store/shared';
import type { z } from 'zod';

import { db, type Tx } from '../../../db/client.ts';
import { DEFAULT_STORE_ID } from '../../../db/seed/delivery.ts';
import { uniqueViolation } from '../../../lib/db-errors.ts';
import { conflict, notFound, validation } from '../../../lib/errors.ts';
import { slugify } from '../../../lib/slug.ts';
import * as checkoutRepo from '../../checkout/repo.ts';
import { insertPriceHistory } from '../../promotions/repo.ts';
import {
  addToBatch,
  receiveStock,
  removeOldestStock,
  shelfLifeOf,
  todayKey,
} from '../../stock/batches.ts';

import * as repo from './repo.ts';

type ProductCreate = z.output<typeof AdminProductCreateSchema>;
type ProductUpdate = z.output<typeof AdminProductUpdateSchema>;
type VariantInput = z.output<typeof AdminVariantInputSchema>;
type VariantUpdate = z.output<typeof AdminVariantUpdateSchema>;
type ImageInput = z.output<typeof AdminImageInputSchema>;
type ListQuery = z.output<typeof AdminProductListQuerySchema>;

const fieldError = (field: string, message: string) =>
  validation({ formErrors: [], fieldErrors: { [field]: [message] } });

// ---------- mapping ----------

const toAdminVariant = (v: repo.VariantWithStock): AdminVariant => {
  const stores = v.stock.map((r) => ({
    storeId: r.storeId,
    storeSlug: r.storeSlug,
    storeName: r.storeName,
    quantity: r.quantity,
    reserved: r.reserved,
    available: r.quantity - r.reserved,
    lowStockThreshold: r.lowStockThreshold,
  }));
  const quantity = stores.reduce((n, r) => n + r.quantity, 0);
  const reserved = stores.reduce((n, r) => n + r.reserved, 0);
  return {
    id: v.id,
    productId: v.productId,
    sku: v.sku,
    name: v.name,
    options: v.options,
    priceCents: v.priceCents,
    compareAtPriceCents: v.compareAtPriceCents,
    memberPriceCents: v.memberPriceCents,
    currency: v.currency,
    weightGrams: v.weightGrams,
    isDefault: v.isDefault,
    netAmount: v.netAmount,
    netUnit: v.netUnit,
    isTrial: v.isTrial,
    swatchHex: v.swatchHex,
    soldByWeight: v.soldByWeight,
    pricePerKgCents: v.pricePerKgCents,
    nominalGrams: v.nominalGrams,
    depositCents: v.depositCents,
    status: v.status,
    quantity,
    reserved,
    available: quantity - reserved,
    lowStockThreshold:
      v.stock.find((r) => r.storeId === DEFAULT_STORE_ID)?.lowStockThreshold ??
      v.stock[0]?.lowStockThreshold ??
      5,
    stores,
    updatedAt: v.updatedAt.toISOString(),
  };
};

// Postgres turns a unique-index violation into a 23505; the admin should hear "that SKU is taken",
// not "internal error". The check-then-insert below gives the friendly message in the normal case;
// this maps the rare race (two admins saving the same SKU at once) to the same answer.
function mapUnique<T>(work: () => Promise<T>): Promise<T> {
  return work().catch((err: unknown) => {
    const constraint = uniqueViolation(err);
    if (constraint === undefined) throw err;
    if (constraint.includes('sku')) {
      throw conflict(ErrorCode.CONFLICT, 'That SKU is already used by another variant');
    }
    if (constraint.includes('options')) {
      throw conflict(ErrorCode.CONFLICT, 'This product already has a variant with those options');
    }
    if (constraint.includes('slug')) {
      throw conflict(ErrorCode.CONFLICT, 'That slug is already used by another product');
    }
    if (constraint.includes('default')) {
      throw conflict(ErrorCode.CONFLICT, 'The default variant changed meanwhile; try again');
    }
    throw err;
  });
}

// ---------- reads ----------

export async function listProducts(query: ListQuery) {
  const { rows, total } = await repo.listProducts(query);
  const data: AdminProductRow[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    status: r.status,
    categoryName: r.categoryName,
    variantCount: r.variantCount ?? 0,
    minPriceCents: r.minPrice === null ? null : Number(r.minPrice),
    maxPriceCents: r.maxPrice === null ? null : Number(r.maxPrice),
    currency: r.currency ?? 'EUR',
    availableStock: Number(r.available ?? 0),
    imageUrl: r.imageUrl,
    updatedAt: r.updatedAt.toISOString(),
  }));
  return {
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function loadProduct(run: typeof db | Tx, id: string): Promise<AdminProduct> {
  const product = await repo.findProduct(run, id);
  if (!product) throw notFound('Product not found');
  const [category, variants, images, tags] = await Promise.all([
    repo.findCategory(run, product.categoryId),
    repo.listVariants(run, id),
    repo.listImages(run, id),
    repo.listProductTags(run, id),
  ]);
  if (!category) throw new Error(`product ${id} has no category`);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    status: product.status,
    category: { id: category.id, slug: category.slug, name: category.name },
    attributes: product.attributes,
    brandId: product.brandId,
    isEco: product.isEco,
    isBestsellerOverride: product.isBestsellerOverride,
    badgeNewUntil: product.badgeNewUntil?.toISOString() ?? null,
    nutrition: product.nutrition,
    ingredients: product.ingredients,
    allergens: product.allergens,
    dietary: product.dietary,
    tags,
    variants: variants.map(toAdminVariant),
    images: images.map((i) => ({
      id: i.id,
      url: i.url,
      alt: i.alt,
      width: i.width,
      height: i.height,
      variantId: i.variantId,
      sortOrder: i.sortOrder,
    })),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export const getProduct = (id: string) => loadProduct(db, id);

// ---------- validation shared by create / add variant / update ----------

// When the product declares its option schema (`attributes.optionKeys`), every variant must use
// exactly those keys: the storefront builds its picker from them, and a variant with a stray or
// missing key would break option resolution.
function assertOptionKeys(optionKeys: string[] | undefined, options: Record<string, string>) {
  if (!optionKeys || optionKeys.length === 0) return;
  const have = Object.keys(options).sort().join('|');
  const want = [...optionKeys].sort().join('|');
  if (have !== want) {
    throw fieldError('options', `Options must be exactly: ${optionKeys.join(', ')}`);
  }
}

async function uniqueSlug(tx: Tx, name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  for (let n = 2; await repo.findProductSlug(tx, candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

function assertPriceTiers(price: number, compareAt: number | null, member: number | null) {
  if (compareAt !== null && compareAt <= price) {
    throw fieldError(
      'compareAtPriceCents',
      'The strike-through price must be higher than the price',
    );
  }
  if (member !== null && member >= price) {
    throw fieldError('memberPriceCents', 'The member price must be lower than the price');
  }
}

// Inserts a variant with its inventory row (and the opening-stock adjustment when there is stock).
async function createVariant(
  tx: Tx,
  productId: string,
  input: VariantInput,
  isDefault: boolean,
  actor: string,
): Promise<repo.VariantRow> {
  const weighed = input.soldByWeight === true;
  // A weighed variant's unit price is the estimate of one nominal unit, never what was typed.
  const priceCents = weighed
    ? estimateCents(input.pricePerKgCents ?? 0, input.nominalGrams ?? 0)
    : input.priceCents;
  assertPriceTiers(priceCents, input.compareAtPriceCents ?? null, input.memberPriceCents ?? null);
  const variant = await repo.insertVariant(tx, {
    productId,
    sku: input.sku,
    name: input.name,
    options: input.options,
    priceCents,
    soldByWeight: weighed,
    pricePerKgCents: weighed ? (input.pricePerKgCents ?? null) : null,
    nominalGrams: weighed ? (input.nominalGrams ?? null) : null,
    compareAtPriceCents: input.compareAtPriceCents ?? null,
    memberPriceCents: input.memberPriceCents ?? null,
    weightGrams: input.weightGrams,
    status: input.status,
    isDefault,
    netAmount: input.netAmount ?? null,
    netUnit: input.netUnit ?? null,
    isTrial: input.isTrial ?? false,
    swatchHex: input.swatchHex ?? null,
    depositCents: input.depositCents ?? 0,
  });
  // The first row of the variant's Omnibus price history (append-only).
  await insertPriceHistory(tx, [
    { variantId: variant.id, priceCents: variant.priceCents, kind: 'base' },
    ...(variant.memberPriceCents !== null
      ? [{ variantId: variant.id, priceCents: variant.memberPriceCents, kind: 'member' as const }]
      : []),
  ]);
  // Every store gets a shelf row so the stock editor lists them all. The opening stock goes on the
  // central store's shelf (Mitte, which receives the supplier delivery); the others start at 0 and
  // are counted on their own, like a real dark store waiting for its first transfer.
  for (const store of await repo.listStores(tx)) {
    const opening = store.id === DEFAULT_STORE_ID ? input.stock : 0;
    await repo.insertInventory(tx, {
      storeId: store.id,
      variantId: variant.id,
      quantity: opening,
      ...(input.lowStockThreshold !== undefined && { lowStockThreshold: input.lowStockThreshold }),
    });
    if (opening > 0) {
      await addToBatch(
        tx,
        store.id,
        variant.id,
        opening,
        freshBestBefore(todayKey(), await shelfLifeOf(tx, variant.id)),
      );
      await repo.insertAdjustment(tx, {
        storeId: store.id,
        variantId: variant.id,
        delta: opening,
        reason: 'restock',
        actor,
        note: 'Opening stock',
      });
    }
  }
  return variant;
}

function imageRows(images: ImageInput[], variantIdBySku: Map<string, string>) {
  return images.map((img, i) => {
    let variantId: string | null = null;
    if (img.variantSku) {
      variantId = variantIdBySku.get(img.variantSku) ?? null;
      if (!variantId) throw fieldError('images', `Image refers to unknown SKU ${img.variantSku}`);
    }
    return {
      url: img.url,
      alt: img.alt,
      width: img.width,
      height: img.height,
      variantId,
      sortOrder: i,
    };
  });
}

// ---------- products ----------

export async function createProduct(input: ProductCreate, actor: string): Promise<AdminProduct> {
  const skus = input.variants.map((v) => v.sku.toLowerCase());
  if (new Set(skus).size !== skus.length) throw fieldError('variants', 'SKUs must be unique');
  const defaults = input.variants.filter((v) => v.isDefault === true).length;
  if (defaults > 1) throw fieldError('variants', 'Only one variant can be the default');
  for (const v of input.variants) assertOptionKeys(input.attributes.optionKeys, v.options);

  const id = await mapUnique(() =>
    db.transaction(async (tx) => {
      if (!(await repo.findCategory(tx, input.categoryId))) {
        throw fieldError('categoryId', 'Unknown category');
      }
      if (input.brandId && !(await repo.brandExists(tx, input.brandId))) {
        throw fieldError('brandId', 'Unknown brand');
      }
      let slug: string;
      if (input.slug) {
        if (await repo.findProductSlug(tx, input.slug)) {
          throw conflict(ErrorCode.CONFLICT, 'That slug is already used by another product');
        }
        slug = input.slug;
      } else {
        slug = await uniqueSlug(tx, input.name);
      }
      const product = await repo.insertProduct(tx, {
        slug,
        name: input.name,
        description: input.description,
        categoryId: input.categoryId,
        status: input.status,
        attributes: input.attributes,
        shelfLifeDays: input.attributes.shelfLifeDays || null,
        brandId: input.brandId,
        isEco: input.isEco,
        isBestsellerOverride: input.isBestsellerOverride,
        badgeNewUntil: input.badgeNewUntil ? new Date(input.badgeNewUntil) : null,
        nutrition: input.nutrition,
        ingredients: input.ingredients,
        allergens: input.allergens,
        dietary: input.dietary,
      });

      // The explicitly flagged variant is the default, else the first one.
      const defaultIndex = Math.max(
        0,
        input.variants.findIndex((v) => v.isDefault === true),
      );
      const idBySku = new Map<string, string>();
      for (const [i, v] of input.variants.entries()) {
        const variant = await createVariant(tx, product.id, v, i === defaultIndex, actor);
        idBySku.set(v.sku, variant.id);
      }
      await repo.replaceImages(tx, product.id, imageRows(input.images, idBySku));
      return product.id;
    }),
  );
  return getProduct(id);
}

export async function updateProduct(id: string, input: ProductUpdate): Promise<AdminProduct> {
  await mapUnique(() =>
    db.transaction(async (tx) => {
      const product = await repo.lockProduct(tx, id);
      if (!product) throw notFound('Product not found');
      if (input.categoryId && !(await repo.findCategory(tx, input.categoryId))) {
        throw fieldError('categoryId', 'Unknown category');
      }
      if (input.brandId && !(await repo.brandExists(tx, input.brandId))) {
        throw fieldError('brandId', 'Unknown brand');
      }
      const variants = await repo.listVariants(tx, id);

      if (input.attributes) {
        for (const v of variants) assertOptionKeys(input.attributes.optionKeys, v.options);
      }
      await repo.updateProduct(tx, id, {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.attributes !== undefined && {
          attributes: input.attributes,
          shelfLifeDays: input.attributes.shelfLifeDays || null,
        }),
        ...(input.brandId !== undefined && { brandId: input.brandId }),
        ...(input.isEco !== undefined && { isEco: input.isEco }),
        ...(input.isBestsellerOverride !== undefined && {
          isBestsellerOverride: input.isBestsellerOverride,
        }),
        ...(input.badgeNewUntil !== undefined && {
          badgeNewUntil: input.badgeNewUntil ? new Date(input.badgeNewUntil) : null,
        }),
        ...(input.nutrition !== undefined && { nutrition: input.nutrition }),
        ...(input.ingredients !== undefined && { ingredients: input.ingredients }),
        ...(input.allergens !== undefined && { allergens: input.allergens }),
        ...(input.dietary !== undefined && { dietary: input.dietary }),
      });
      if (input.images) {
        const idBySku = new Map(variants.map((v) => [v.sku, v.id]));
        await repo.replaceImages(tx, id, imageRows(input.images, idBySku));
      }
    }),
  );
  return getProduct(id);
}

// ---------- variants ----------

export async function addVariant(
  productId: string,
  input: VariantInput,
  actor: string,
): Promise<AdminVariant> {
  const variantId = await mapUnique(() =>
    db.transaction(async (tx) => {
      const product = await repo.lockProduct(tx, productId);
      if (!product) throw notFound('Product not found');
      assertOptionKeys(product.attributes.optionKeys, input.options);
      // Friendly message for the normal duplicate; the unique index still guards the race.
      const existing = await repo.listVariants(tx, productId);
      if (existing.some((v) => v.sku.toLowerCase() === input.sku.toLowerCase())) {
        throw conflict(ErrorCode.CONFLICT, 'That SKU is already used by another variant');
      }
      const hasDefault = existing.some((v) => v.isDefault);
      const makeDefault = input.isDefault === true || !hasDefault;
      if (makeDefault) await repo.demoteDefaults(tx, productId);
      return (await createVariant(tx, productId, input, makeDefault, actor)).id;
    }),
  );
  return loadVariant(variantId);
}

async function loadVariant(variantId: string): Promise<AdminVariant> {
  const variant = await repo.findVariantWithStock(db, variantId);
  if (!variant) throw notFound('Variant not found');
  return toAdminVariant(variant);
}

// Locks product first, then variant: the same order everywhere in this module.
async function lockedVariant(tx: Tx, variantId: string) {
  const found = await repo.findVariant(tx, variantId);
  if (!found) throw notFound('Variant not found');
  const product = await repo.lockProduct(tx, found.productId);
  const variant = await repo.findVariant(tx, variantId); // re-read under the lock
  if (!product || !variant) throw notFound('Variant not found');
  return { product, variant };
}

export async function updateVariant(
  variantId: string,
  input: VariantUpdate,
): Promise<AdminVariant> {
  await mapUnique(() =>
    db.transaction(async (tx) => {
      const { product, variant } = await lockedVariant(tx, variantId);
      if (input.options) assertOptionKeys(product.attributes.optionKeys, input.options);

      // What the variant will be after this save: weighed or not, and the numbers that go with it.
      const weighed = input.soldByWeight ?? variant.soldByWeight;
      const pricePerKg = weighed ? (input.pricePerKgCents ?? variant.pricePerKgCents) : null;
      const nominal = weighed ? (input.nominalGrams ?? variant.nominalGrams) : null;
      if (weighed && (pricePerKg === null || nominal === null)) {
        throw fieldError(
          'pricePerKgCents',
          'A weighed item needs a price per kilogram and a nominal weight',
        );
      }
      // The unit price of a weighed variant is derived; a typed one is ignored.
      const derivedPrice =
        weighed && pricePerKg !== null && nominal !== null
          ? estimateCents(pricePerKg, nominal)
          : null;
      const price = derivedPrice ?? input.priceCents ?? variant.priceCents;
      const compareAt =
        input.compareAtPriceCents === undefined
          ? variant.compareAtPriceCents
          : input.compareAtPriceCents;
      const member =
        input.memberPriceCents === undefined ? variant.memberPriceCents : input.memberPriceCents;
      assertPriceTiers(price, compareAt, member);

      if (input.sku !== undefined && input.sku.toLowerCase() !== variant.sku.toLowerCase()) {
        const siblings = await repo.listVariants(tx, product.id);
        if (siblings.some((v) => v.sku.toLowerCase() === input.sku?.toLowerCase())) {
          throw conflict(ErrorCode.CONFLICT, 'That SKU is already used by another variant');
        }
      }
      if (input.isDefault === false && variant.isDefault) {
        throw fieldError('isDefault', 'Make another variant the default instead');
      }
      if (input.isDefault === true && !variant.isDefault) {
        await repo.demoteDefaults(tx, product.id, variant.id);
      }

      const { lowStockThreshold, ...rest } = input;
      const fields = { ...rest, ...(derivedPrice !== null && { priceCents: derivedPrice }) };
      const weightChange =
        input.soldByWeight !== undefined ||
        input.pricePerKgCents !== undefined ||
        input.nominalGrams !== undefined;
      // A price change is a new history row (never an edit of an old one), in this transaction.
      if (fields.priceCents !== undefined && fields.priceCents !== variant.priceCents) {
        await insertPriceHistory(tx, [{ variantId, priceCents: fields.priceCents, kind: 'base' }]);
      }
      // Same for a member price that is set or changed (excluded from the Omnibus reference).
      if (fields.memberPriceCents != null && fields.memberPriceCents !== variant.memberPriceCents) {
        await insertPriceHistory(tx, [
          { variantId, priceCents: fields.memberPriceCents, kind: 'member' },
        ]);
      }
      await repo.updateVariant(tx, variantId, {
        ...(fields.sku !== undefined && { sku: fields.sku }),
        ...(fields.name !== undefined && { name: fields.name }),
        ...(fields.options !== undefined && { options: fields.options }),
        ...(fields.priceCents !== undefined && { priceCents: fields.priceCents }),
        ...(weightChange && {
          soldByWeight: weighed,
          pricePerKgCents: pricePerKg,
          nominalGrams: nominal,
        }),
        ...(fields.compareAtPriceCents !== undefined && {
          compareAtPriceCents: fields.compareAtPriceCents,
        }),
        ...(fields.memberPriceCents !== undefined && {
          memberPriceCents: fields.memberPriceCents,
        }),
        ...(fields.weightGrams !== undefined && { weightGrams: fields.weightGrams }),
        ...(fields.status !== undefined && { status: fields.status }),
        ...(fields.isDefault !== undefined && { isDefault: fields.isDefault }),
        ...(fields.netAmount !== undefined && { netAmount: fields.netAmount }),
        ...(fields.netUnit !== undefined && { netUnit: fields.netUnit }),
        ...(fields.isTrial !== undefined && { isTrial: fields.isTrial }),
        ...(fields.swatchHex !== undefined && { swatchHex: fields.swatchHex }),
        ...(fields.depositCents !== undefined && { depositCents: fields.depositCents }),
      });
      if (lowStockThreshold !== undefined) {
        await repo.setLowStockThreshold(tx, variantId, lowStockThreshold);
      }
    }),
  );
  return loadVariant(variantId);
}

export async function deleteVariant(variantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { product, variant } = await lockedVariant(tx, variantId);
    const siblings = await repo.listVariants(tx, product.id);
    if (siblings.length <= 1) {
      throw conflict(
        ErrorCode.CONFLICT,
        'A product needs at least one variant; archive the product instead',
      );
    }
    // Stock held by an unpaid checkout cannot be deleted from under it. Locking in the shared
    // order (inventory after product) keeps this safe against a concurrent checkout.
    const stock = await repo.lockInventoryRows(tx, variantId);
    const reserved = stock.reduce((n, r) => n + r.reserved, 0);
    if (reserved > 0) {
      throw conflict(
        ErrorCode.CONFLICT,
        'This variant is reserved by unpaid orders; archive it instead of deleting it',
        { reserved },
      );
    }
    await repo.deleteVariant(tx, variantId);
    // The product must keep exactly one default: promote the oldest remaining variant.
    if (variant.isDefault) {
      const next = siblings.find((v) => v.id !== variantId);
      if (next) await repo.updateVariant(tx, next.id, { isDefault: true });
    }
  });
}

// ---------- inventory ----------

export async function setInventory(
  variantId: string,
  input: AdminInventorySet & { quantity: number },
  actor: string,
): Promise<AdminInventoryResult> {
  return db.transaction(async (tx) => {
    // Same lock helper as checkout, so an admin edit queues behind (or ahead of) a reservation
    // instead of racing it.
    const storeId = input.storeId ?? DEFAULT_STORE_ID;
    await checkoutRepo.lockInventory(tx, storeId, [variantId]);
    const row = await repo.lockInventoryRow(tx, storeId, variantId);
    if (!row) throw notFound('Variant not found in that store');
    // Units promised to unpaid orders cannot be taken away: the shopper has been told they are
    // theirs, and `reserved <= quantity` is what keeps "available" from going negative.
    if (input.quantity < row.reserved) {
      throw conflict(
        ErrorCode.CONFLICT,
        `${row.reserved} units are reserved by unpaid orders; quantity cannot go below that`,
        { reserved: row.reserved },
      );
    }
    const delta = input.quantity - row.quantity;
    if (delta !== 0) {
      // The batches move with the stock row: an increase is a new delivery (dated from the
      // shelf life unless the admin gave a date), a decrease takes the oldest packs first.
      if (delta > 0) {
        const bestBefore =
          input.bestBefore ?? freshBestBefore(todayKey(), await shelfLifeOf(tx, variantId));
        await receiveStock(tx, storeId, variantId, delta, bestBefore);
      } else {
        await removeOldestStock(tx, storeId, variantId, -delta);
      }
      await repo.insertAdjustment(tx, {
        storeId,
        variantId,
        delta,
        reason: input.reason,
        actor,
        note: input.note ?? null,
      });
    }
    if (input.lowStockThreshold !== undefined) {
      await repo.setLowStockThreshold(tx, variantId, input.lowStockThreshold, storeId);
    }
    return {
      variantId,
      storeId,
      quantity: input.quantity,
      reserved: row.reserved,
      available: input.quantity - row.reserved,
      delta,
    };
  });
}

// ---------- per-currency prices ----------

const SELLING_CURRENCIES: readonly string[] = [...new Set(STORES.map((st) => st.currency))];

export async function getVariantPrices(variantId: string) {
  if (!(await repo.findVariant(db, variantId))) throw notFound('Variant not found');
  return { variantId, prices: await repo.listVariantPrices(db, variantId) };
}

// Replace the non-EUR prices of one variant. A currency no store view sells in is refused (a row
// nobody reads would only mislead); leaving a currency out removes it, which hides the variant in
// that store: there is never a fallback or a conversion.
export async function setVariantPrices(variantId: string, input: AdminVariantPricesInput) {
  const unknown = input.prices.find((p) => !SELLING_CURRENCIES.includes(p.currency));
  if (unknown) throw fieldError('prices', `No store view sells in ${unknown.currency}`);
  await db.transaction(async (tx) => {
    await lockedVariant(tx, variantId);
    await repo.replaceVariantPrices(tx, variantId, input.prices);
  });
  return getVariantPrices(variantId);
}
