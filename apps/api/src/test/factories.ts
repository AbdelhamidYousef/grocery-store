import { eq } from 'drizzle-orm';

import { db } from '../db/client.ts';
import {
  brands,
  cartItems,
  carts,
  categories,
  collectionProducts,
  collections,
  productTags,
  reviews,
  tags,
  inventory,
  productImages,
  productVariants,
  variantPrices,
  products,
  shippingMethods,
  users,
} from '../db/schema/index.ts';
import type { ProductAttributes } from '../db/schema/products.ts';

// Unique suffix per call so factories can be used many times inside one test without colliding
// on slug / SKU / email unique constraints.
let counter = 0;
const next = () => ++counter;

function first<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (!row) throw new Error(`factory: insert of ${what} returned no row`);
  return row;
}

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const n = next();
  return first(
    await db
      .insert(users)
      .values({
        email: `user${n}@pawsome.test`,
        // Not a real hash: hashing with argon2 would slow every test; login tests hash on their own.
        passwordHash: 'test-hash',
        firstName: 'Test',
        lastName: `User${n}`,
        ...overrides,
      })
      .returning(),
    'user',
  );
}

export async function createCategory(overrides: Partial<typeof categories.$inferInsert> = {}) {
  const n = next();
  return first(
    await db
      .insert(categories)
      .values({ slug: `cat-${n}`, name: `Category ${n}`, ...overrides })
      .returning(),
    'category',
  );
}

export type VariantInput = {
  name?: string;
  options?: Record<string, string>;
  priceCents?: number;
  compareAtPriceCents?: number;
  /** A GBP price for the UK store view; without it the variant is not sold there. */
  gbpCents?: number;
  weightGrams?: number;
  status?: 'draft' | 'active' | 'archived';
  /** Units in stock; defaults to 50. */
  stock?: number;
  reserved?: number;
  lowStockThreshold?: number;
  netAmount?: number;
  netUnit?: 'g' | 'ml';
  isTrial?: boolean;
  swatchHex?: string;
};

export type ImageInput = { url?: string; alt?: string; variantIndex?: number; sortOrder?: number };

export async function createProduct(
  input: {
    name?: string;
    slug?: string;
    description?: string;
    status?: 'draft' | 'active' | 'archived';
    /** Put the product in this category instead of a fresh one. */
    categoryId?: string;
    attributes?: ProductAttributes;
    brandId?: string;
    isEco?: boolean;
    isBestsellerOverride?: boolean;
    badgeNewUntil?: Date;
    createdAt?: Date;
    variants?: VariantInput[];
    images?: ImageInput[];
  } = {},
) {
  const n = next();
  const category = input.categoryId
    ? first(
        await db.select().from(categories).where(eq(categories.id, input.categoryId)),
        'category lookup',
      )
    : await createCategory({ slug: `test-category-${n}`, name: `Test category ${n}` });

  const product = first(
    await db
      .insert(products)
      .values({
        slug: input.slug ?? `test-product-${n}`,
        name: input.name ?? `Test product ${n}`,
        description: input.description ?? 'A product made by a test factory.',
        categoryId: category.id,
        status: input.status ?? 'active',
        attributes: input.attributes ?? {},
        ...(input.brandId && { brandId: input.brandId }),
        ...(input.isEco !== undefined && { isEco: input.isEco }),
        ...(input.isBestsellerOverride !== undefined && {
          isBestsellerOverride: input.isBestsellerOverride,
        }),
        ...(input.badgeNewUntil && { badgeNewUntil: input.badgeNewUntil }),
        // An old date by default: a fresh row would carry the derived "New" badge, which would
        // leak into every test that is not about badges.
        createdAt: input.createdAt ?? new Date(Date.now() - 365 * 24 * 3600 * 1000 + n),
      })
      .returning(),
    'product',
  );

  const variantInputs = input.variants ?? [{}];
  const variants = await db
    .insert(productVariants)
    .values(
      variantInputs.map((v, i) => ({
        productId: product.id,
        sku: `PW-TEST-${n}-${i + 1}`,
        name: v.name ?? `Variant ${i + 1}`,
        // Options must differ per variant (unique per product), hence the index.
        options: v.options ?? { variant: String(i + 1) },
        priceCents: v.priceCents ?? 1000,
        compareAtPriceCents: v.compareAtPriceCents ?? null,
        status: v.status ?? 'active',
        weightGrams: v.weightGrams ?? 200,
        isDefault: i === 0,
        ...(v.netAmount !== undefined && { netAmount: v.netAmount }),
        ...(v.netUnit && { netUnit: v.netUnit }),
        ...(v.isTrial !== undefined && { isTrial: v.isTrial }),
        ...(v.swatchHex && { swatchHex: v.swatchHex }),
      })),
    )
    .returning();

  const gbp = variants.flatMap((variant, i) => {
    const cents = variantInputs[i]?.gbpCents;
    return cents === undefined
      ? []
      : [{ variantId: variant.id, currency: 'GBP', priceCents: cents }];
  });
  if (gbp.length > 0) await db.insert(variantPrices).values(gbp);

  await db.insert(inventory).values(
    variants.map((variant, i) => ({
      variantId: variant.id,
      quantity: variantInputs[i]?.stock ?? 50,
      reserved: variantInputs[i]?.reserved ?? 0,
      ...(variantInputs[i]?.lowStockThreshold !== undefined && {
        lowStockThreshold: variantInputs[i]?.lowStockThreshold,
      }),
    })),
  );

  const images = input.images?.length
    ? await db
        .insert(productImages)
        .values(
          input.images.map((img, i) => ({
            productId: product.id,
            variantId:
              img.variantIndex === undefined ? null : (variants[img.variantIndex]?.id ?? null),
            url: img.url ?? `/products/${product.slug}-${i + 1}.webp`,
            alt: img.alt ?? `${product.name} image ${i + 1}`,
            width: 1200,
            height: 1200,
            sortOrder: img.sortOrder ?? i,
          })),
        )
        .returning()
    : [];

  return { product, category, variants, images };
}

export async function createCart(
  input: {
    userId?: string | null;
    status?: 'active' | 'merged' | 'converted' | 'abandoned';
    items?: { variantId: string; quantity: number; lastSeenPriceCents?: number | null }[];
  } = {},
) {
  const cart = first(
    await db
      .insert(carts)
      .values({
        userId: input.userId ?? null,
        status: input.status ?? 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      })
      .returning(),
    'cart',
  );
  // One insert per line, not one batch: a batch gives every row the same created_at (now() is
  // fixed per statement), which would leave the cart's line order to the random uuid tiebreak.
  const items = [];
  for (const item of input.items ?? []) {
    items.push(
      first(
        await db
          .insert(cartItems)
          .values({ cartId: cart.id, ...item })
          .returning(),
        'cart item',
      ),
    );
  }
  return { cart, items };
}

// The two seeded methods (standard, free over 49.00; express) under their real codes and prices, so
// tests can assert real totals.
export async function createShippingMethods() {
  return db
    .insert(shippingMethods)
    .values([
      {
        code: 'standard',
        name: 'Standard',
        baseCents: 490,
        perKgCents: 100,
        freeOverCents: 4900,
        byCurrency: { GBP: { baseCents: 450, perKgCents: 100, freeOverCents: 4200 } },
        etaDaysMin: 3,
        etaDaysMax: 5,
      },
      {
        code: 'express',
        name: 'Express',
        baseCents: 990,
        perKgCents: 200,
        byCurrency: { GBP: { baseCents: 890, perKgCents: 180, freeOverCents: null } },
        etaDaysMin: 1,
        etaDaysMax: 2,
      },
    ])
    .returning();
}

export async function createBrand(overrides: Partial<typeof brands.$inferInsert> = {}) {
  const n = next();
  return first(
    await db
      .insert(brands)
      .values({ slug: `brand-${n}`, name: `Brand ${n}`, ...overrides })
      .returning(),
    'brand',
  );
}

export async function createTag(overrides: Partial<typeof tags.$inferInsert> = {}) {
  const n = next();
  return first(
    await db
      .insert(tags)
      .values({ slug: `tag-${n}`, name: `Tag ${n}`, ...overrides })
      .returning(),
    'tag',
  );
}

export async function tagProduct(productId: string, tagId: string) {
  await db.insert(productTags).values({ productId, tagId });
}

/** A collection live right now unless the overrides say otherwise; `productIds` are in order. */
export async function createCollection(
  overrides: Partial<typeof collections.$inferInsert> = {},
  productIds: string[] = [],
) {
  const n = next();
  const collection = first(
    await db
      .insert(collections)
      .values({ slug: `collection-${n}`, name: `Collection ${n}`, ...overrides })
      .returning(),
    'collection',
  );
  if (productIds.length > 0) {
    await db.insert(collectionProducts).values(
      productIds.map((productId, position) => ({
        collectionId: collection.id,
        productId,
        position,
      })),
    );
  }
  return collection;
}

// A review written straight into the table (bypassing the API), approved by default so read
// tests need no moderation step. Pass `userId` to tie it to an account; each call otherwise makes
// its own user, because (user, product) is unique.
export async function createReview(
  productId: string,
  overrides: Partial<typeof reviews.$inferInsert> = {},
) {
  const userId = overrides.userId ?? (await createUser()).id;
  const status = overrides.status ?? 'approved';
  return first(
    await db
      .insert(reviews)
      .values({
        productId,
        userId,
        rating: 5,
        title: 'Lovely product',
        body: 'Exactly what my pet needed and it arrived quickly.',
        wouldRecommend: true,
        status,
        ...(status !== 'pending' && { moderatedAt: new Date() }),
        ...overrides,
      })
      .returning(),
    'review',
  );
}
