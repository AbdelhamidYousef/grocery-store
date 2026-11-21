import { and, eq, sql, type AnyColumn, type SQL } from 'drizzle-orm';

import { currentStoreId } from '../modules/i18n/context.ts';

import { inventory } from './schema/inventory.ts';

// Stock is per dark store, so every read of availability names the store. By default it is the one
// of the request in flight (the shopper's postcode, see `deliveryContext`); callers outside a request,
// or reading another store (the admin, the back-in-stock job), pass it. A store can be a literal id, a column
// or an expression of the surrounding query.
export type StoreRef = string | AnyColumn | SQL;
const storeSql = (store: StoreRef): SQL =>
  typeof store === 'string' ? sql`${store}::uuid` : sql`${store}`;

/**
 * The join condition that picks one store's `inventory` row of a variant:
 * `.leftJoin(inventory, inventoryAt(productVariants.id))`.
 */
export const inventoryAt = (variantId: AnyColumn, store: StoreRef = currentStoreId()): SQL =>
  and(eq(inventory.variantId, variantId), sql`${inventory.storeId} = ${storeSql(store)}`)!;

// A kit has no stock row: how many can be sold is derived from its components, at read time, so it
// can never drift. `min(floor(component available / qty per kit))`; a component without a stock row
// counts as 0, and so does one whose variant or product is no longer active (an archived part
// must not keep selling inside a kit). The component rows are the ones of the same store. The subquery is NULL for a variant that is not a bundle, which is how the two
// helpers below tell the cases apart. `variantId` must be the (unaliased) product_variants.id of
// the surrounding query.
const bundleAvailable = (variantId: AnyColumn, store: StoreRef): SQL<number | null> =>
  sql`(select min(case when cv.status = 'active' and cp.status = 'active' then greatest(coalesce(ci.quantity - ci.reserved, 0), 0) / bi.qty else 0 end)::int from bundle_items bi join product_variants cv on cv.id = bi.component_variant_id join products cp on cp.id = cv.product_id left join inventory ci on ci.variant_id = bi.component_variant_id and ci.store_id = ${storeSql(store)} where bi.bundle_variant_id = ${variantId})`;

/**
 * Units on hand of a variant (the `inventory` table must be LEFT JOINed in the same query). For a
 * bundle: how many kits the components allow. Null when the variant has no stock row.
 */
export const stockQuantity = (
  variantId: AnyColumn,
  store: StoreRef = currentStoreId(),
): SQL<number | null> => sql`coalesce(${bundleAvailable(variantId, store)}, ${inventory.quantity})`;

/** Units held by pending orders; always 0 for a bundle (its components hold the reservations). */
export const stockReserved = (
  variantId: AnyColumn,
  store: StoreRef = currentStoreId(),
): SQL<number | null> =>
  sql`case when ${bundleAvailable(variantId, store)} is null then ${inventory.reserved} else 0 end`;
