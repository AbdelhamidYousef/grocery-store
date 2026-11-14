import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

import { inventory } from './schema/inventory.ts';

// A kit has no stock row: how many can be sold is derived from its components, at read time, so it
// can never drift. `min(floor(component available / qty per kit))`; a component without a stock row
// counts as 0. The subquery is NULL for a variant that is not a bundle, which is how the two
// helpers below tell the cases apart. `variantId` must be the (unaliased) product_variants.id of
// the surrounding query.
const bundleAvailable = (variantId: AnyColumn): SQL<number | null> =>
  sql`(select min(greatest(coalesce(ci.quantity - ci.reserved, 0), 0) / bi.qty)::int from bundle_items bi left join inventory ci on ci.variant_id = bi.component_variant_id where bi.bundle_variant_id = ${variantId})`;

/**
 * Units on hand of a variant (the `inventory` table must be LEFT JOINed in the same query). For a
 * bundle: how many kits the components allow. Null when the variant has no stock row.
 */
export const stockQuantity = (variantId: AnyColumn): SQL<number | null> =>
  sql`coalesce(${bundleAvailable(variantId)}, ${inventory.quantity})`;

/** Units held by pending orders; always 0 for a bundle (its components hold the reservations). */
export const stockReserved = (variantId: AnyColumn): SQL<number | null> =>
  sql`case when ${bundleAvailable(variantId)} is null then ${inventory.reserved} else 0 end`;
