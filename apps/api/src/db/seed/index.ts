import { fileURLToPath } from 'node:url';

import { inArray, sql } from 'drizzle-orm';

import { closeDb, db } from '../client.ts';
import {
  categories as categoriesTable,
  inventory,
  productImages,
  productVariants,
  products as productsTable,
  shippingMethods as shippingTable,
  users,
} from '../schema/index.ts';

import { categories } from './categories.ts';
import { expandVariants, imageRows, stockLevels } from './expand.ts';
import { products } from './products.ts';
import { shippingMethods } from './shipping.ts';
import { DEMO_PASSWORD, demoUsers, hashDemoPassword } from './users.ts';

// `excluded` is the row that failed to insert; `ON CONFLICT DO UPDATE` copies its values over the
// existing row. This is what makes the seed safe to run again: definitions are refreshed in place
// instead of duplicated.
const excluded = (column: string) => sql.raw(`excluded."${column}"`);

export async function runSeed() {
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

    // ---- products ----
    const productRows = await tx
      .insert(productsTable)
      .values(
        products.map((p) => {
          const id = categoryId.get(p.categorySlug);
          if (!id) throw new Error(`unknown category ${p.categorySlug} on ${p.slug}`);
          return {
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
          return { variantId: id, quantity: stock[i] ?? 0 };
        }),
      )
      .onConflictDoNothing();

    // ---- images: rows have no natural unique key, so replace the seeded products' rows ----
    await tx.delete(productImages).where(inArray(productImages.productId, [...productId.values()]));
    await tx.insert(productImages).values(
      products.flatMap((p) => {
        const id = productId.get(p.slug);
        if (!id) throw new Error(`product ${p.slug} was not inserted`);
        return imageRows(p).map((img) => ({
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
