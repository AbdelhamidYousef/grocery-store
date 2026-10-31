import { fileURLToPath } from 'node:url';

import { inArray, sql } from 'drizzle-orm';

import { closeDb, db } from '../client.ts';
import {
  brands as brandsTable,
  categories as categoriesTable,
  collectionProducts,
  collections as collectionsTable,
  inventory,
  productImages,
  productTags,
  productVariants,
  products as productsTable,
  shippingMethods as shippingTable,
  tags as tagsTable,
  users,
} from '../schema/index.ts';

import { HOUSE_BRAND, brands } from './brands.ts';
import { categories } from './categories.ts';
import { collections, windowDates } from './collections.ts';
import { expandVariants, stockLevels } from './expand.ts';
import { imageRowsFor } from './images.ts';
import { products } from './products.ts';
import { validateSeed } from './schema.ts';
import { shippingMethods } from './shipping.ts';
import { tags } from './tags.ts';
import { DEMO_PASSWORD, demoUsers, hashDemoPassword } from './users.ts';

// `excluded` is the row that failed to insert; `ON CONFLICT DO UPDATE` copies its values over the
// existing row. This is what makes the seed safe to run again: definitions are refreshed in place
// instead of duplicated.
const excluded = (column: string) => sql.raw(`excluded."${column}"`);

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runSeed(now = new Date()) {
  // A typo in any seed file fails here, naming the product, before the database is touched.
  validateSeed(products);
  const passwordHash = await hashDemoPassword();

  await db.transaction(async (tx) => {
    // ---- categories: parents first, so children can reference their ids ----
    const parentRows = await tx
      .insert(categoriesTable)
      .values(
        categories.map((c, i) => ({
          slug: c.slug,
          name: c.name,
          description: c.description,
          sortOrder: i,
          attributes: c.attributes ?? {},
        })),
      )
      .onConflictDoUpdate({
        target: categoriesTable.slug,
        set: {
          name: excluded('name'),
          description: excluded('description'),
          sortOrder: excluded('sort_order'),
          attributes: excluded('attributes'),
        },
      })
      .returning({ id: categoriesTable.id, slug: categoriesTable.slug });
    const parentId = new Map(parentRows.map((r) => [r.slug, r.id]));

    const childValues = categories.flatMap((c) =>
      c.children.map((child, i) => ({
        slug: child.slug,
        name: child.name,
        description: child.description,
        parentId: parentId.get(c.slug) ?? null,
        sortOrder: i,
      })),
    );
    const childRows = await tx
      .insert(categoriesTable)
      .values(childValues)
      .onConflictDoUpdate({
        target: categoriesTable.slug,
        set: {
          name: excluded('name'),
          description: excluded('description'),
          parentId: excluded('parent_id'),
          sortOrder: excluded('sort_order'),
        },
      })
      .returning({ id: categoriesTable.id, slug: categoriesTable.slug });
    const categoryId = new Map(childRows.map((r) => [r.slug, r.id]));

    // ---- brands and tags (products reference them) ----
    const brandRows = await tx
      .insert(brandsTable)
      .values(brands)
      .onConflictDoUpdate({
        target: brandsTable.slug,
        set: {
          name: excluded('name'),
          tagline: excluded('tagline'),
          story: excluded('story'),
          accentColor: excluded('accent_color'),
        },
      })
      .returning({ id: brandsTable.id, slug: brandsTable.slug });
    const brandId = new Map(brandRows.map((r) => [r.slug, r.id]));

    const tagRows = await tx
      .insert(tagsTable)
      .values(tags)
      .onConflictDoUpdate({ target: tagsTable.slug, set: { name: excluded('name') } })
      .returning({ id: tagsTable.id, slug: tagsTable.slug });
    const tagId = new Map(tagRows.map((r) => [r.slug, r.id]));

    // ---- products ----
    const productRows = await tx
      .insert(productsTable)
      .values(
        products.map((p, i) => {
          const id = categoryId.get(p.categorySlug);
          if (!id) throw new Error(`unknown category ${p.categorySlug} on ${p.slug}`);
          return {
            brandId: brandId.get(p.brand ?? HOUSE_BRAND) ?? null,
            isEco: p.eco ?? false,
            isBestsellerOverride: p.bestseller ?? false,
            // Spread over the past year so the derived "New" badge shows on a handful of
            // products, not all of them. Not in the conflict set: a re-seed keeps the dates.
            createdAt: new Date(
              now.getTime() - (p.isNew ? 3 + (i % 20) : 45 + ((i * 7) % 300)) * DAY_MS,
            ),
            slug: p.slug,
            name: p.name,
            description: p.description,
            categoryId: id,
            status: 'active' as const,
            attributes: {
              pet: p.pet,
              material: p.material,
              ageStage: p.ageStage,
              optionKeys: p.axes.map((a) => a.key),
            },
          };
        }),
      )
      .onConflictDoUpdate({
        target: productsTable.slug,
        set: {
          name: excluded('name'),
          description: excluded('description'),
          categoryId: excluded('category_id'),
          status: excluded('status'),
          attributes: excluded('attributes'),
          brandId: excluded('brand_id'),
          isEco: excluded('is_eco'),
          isBestsellerOverride: excluded('is_bestseller_override'),
        },
      })
      .returning({ id: productsTable.id, slug: productsTable.slug });
    const productId = new Map(productRows.map((r) => [r.slug, r.id]));

    // ---- variants ----
    const variantValues = products.flatMap((p) => {
      const id = productId.get(p.slug);
      if (!id) throw new Error(`product ${p.slug} was not inserted`);
      return expandVariants(p).map((v) => ({ ...v, productId: id, status: 'active' as const }));
    });
    const variantRows = await tx
      .insert(productVariants)
      .values(variantValues)
      .onConflictDoUpdate({
        target: productVariants.sku,
        set: {
          productId: excluded('product_id'),
          name: excluded('name'),
          options: excluded('options'),
          priceCents: excluded('price_cents'),
          compareAtPriceCents: excluded('compare_at_price_cents'),
          weightGrams: excluded('weight_grams'),
          netAmount: excluded('net_amount'),
          netUnit: excluded('net_unit'),
          isTrial: excluded('is_trial'),
          swatchHex: excluded('swatch_hex'),
          isDefault: excluded('is_default'),
          status: excluded('status'),
        },
      })
      .returning({ id: productVariants.id, sku: productVariants.sku });
    const variantId = new Map(variantRows.map((r) => [r.sku, r.id]));

    // ---- inventory: insert only. A re-seed must not reset stock that has since been sold. ----
    const stock = stockLevels(variantValues.length);
    await tx
      .insert(inventory)
      .values(
        variantValues.map((v, i) => {
          const id = variantId.get(v.sku);
          if (!id) throw new Error(`variant ${v.sku} was not inserted`);
          // A sample is the way in to a product, so it is never the sold-out one (the random
          // stock levels would otherwise leave some samples at 0 or 3).
          return { variantId: id, quantity: v.isTrial ? 50 : (stock[i] ?? 0) };
        }),
      )
      .onConflictDoNothing();

    // ---- product tags and collections: join rows, replaced wholesale for the seeded products ----
    await tx.delete(productTags).where(inArray(productTags.productId, [...productId.values()]));
    const tagValues = products.flatMap((p) =>
      (p.tags ?? []).map((slug) => ({
        productId: productId.get(p.slug) ?? '',
        tagId: tagId.get(slug) ?? '',
      })),
    );
    if (tagValues.length > 0) await tx.insert(productTags).values(tagValues);

    // Window dates are recomputed on every seed so the demo always has the current season live.
    const collectionRows = await tx
      .insert(collectionsTable)
      .values(
        collections.map((c, i) => ({
          slug: c.slug,
          name: c.name,
          description: c.description,
          accentColor: c.accentColor,
          sortOrder: i,
          ...(c.window ? windowDates(c.window, now) : { startsAt: null, endsAt: null }),
        })),
      )
      .onConflictDoUpdate({
        target: collectionsTable.slug,
        set: {
          name: excluded('name'),
          description: excluded('description'),
          accentColor: excluded('accent_color'),
          sortOrder: excluded('sort_order'),
          startsAt: excluded('starts_at'),
          endsAt: excluded('ends_at'),
        },
      })
      .returning({ id: collectionsTable.id, slug: collectionsTable.slug });
    const collectionId = new Map(collectionRows.map((r) => [r.slug, r.id]));
    await tx
      .delete(collectionProducts)
      .where(inArray(collectionProducts.collectionId, [...collectionId.values()]));
    const members = collections.flatMap((c) =>
      products
        .filter((p) => {
          if (c.membership === 'eco') return p.eco === true;
          if (c.membership === 'under-10')
            return expandVariants(p).some((v) => !v.isTrial && v.priceCents < 1000);
          return p.collections?.includes(c.slug) ?? false;
        })
        .map((p, position) => ({
          collectionId: collectionId.get(c.slug) ?? '',
          productId: productId.get(p.slug) ?? '',
          position,
        })),
    );
    if (members.length > 0) await tx.insert(collectionProducts).values(members);

    // ---- images: rows have no natural unique key, so replace the seeded products' rows ----
    await tx.delete(productImages).where(inArray(productImages.productId, [...productId.values()]));
    await tx.insert(productImages).values(
      products.flatMap((p) => {
        const id = productId.get(p.slug);
        if (!id) throw new Error(`product ${p.slug} was not inserted`);
        return imageRowsFor(p).map((img) => ({
          productId: id,
          url: img.url,
          alt: img.alt,
          width: img.width,
          height: img.height,
          sortOrder: img.sortOrder,
        }));
      }),
    );

    // ---- shipping ----
    await tx
      .insert(shippingTable)
      .values(shippingMethods)
      .onConflictDoUpdate({
        target: shippingTable.code,
        set: {
          name: excluded('name'),
          baseCents: excluded('base_cents'),
          perKgCents: excluded('per_kg_cents'),
          freeOverCents: excluded('free_over_cents'),
          etaDaysMin: excluded('eta_days_min'),
          etaDaysMax: excluded('eta_days_max'),
          isActive: excluded('is_active'),
        },
      });

    // ---- users: the password hash is reset too, so the printed credentials are always true ----
    await tx
      .insert(users)
      .values(demoUsers.map((u) => ({ ...u, passwordHash })))
      .onConflictDoUpdate({
        target: users.email,
        set: {
          passwordHash: excluded('password_hash'),
          firstName: excluded('first_name'),
          lastName: excluded('last_name'),
          role: excluded('role'),
        },
      });
  });
}

// Only when run as a script (`pnpm db:seed`); the reset script and tests import runSeed instead.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runSeed();
  await closeDb();
  console.log('seed complete');
  console.log(`\nDemo logins (password for all: ${DEMO_PASSWORD})`);
  for (const u of demoUsers) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}
