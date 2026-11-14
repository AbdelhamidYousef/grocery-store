import { sql, type SQL } from 'drizzle-orm';

import { productVariants } from '../../db/schema/index.ts';

import { currentStore } from './context.ts';

// The price of a variant in a currency, as a SQL scalar: a drop-in for `product_variants.price_cents`
// in a select, where or order by. It is NULL when the variant has no price in that currency, which
// callers treat as "not sold in this store" (never as zero, never converted). EUR is read straight
// from the base column (the `variant_prices` EUR row mirrors it).
// The currency goes in as a literal, not a bind parameter, so every use of this expression in one
// statement is textually identical (SELECT DISTINCT ... ORDER BY needs that). It only ever comes
// from the store registry; the check keeps it that way.
function literal(currency: string): SQL {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`not a currency code: ${currency}`);
  return sql.raw(`'${currency}'`);
}

export function priceIn(currency: string = currentStore().currency): SQL<number> {
  if (currency === 'EUR') return sql<number>`${productVariants.priceCents}`;
  return sql<number>`(select vp.price_cents from variant_prices vp where vp.variant_id = ${productVariants.id} and vp.currency = ${literal(currency)})`;
}

// "This variant is on sale in the store's currency."
export function hasPriceIn(currency: string = currentStore().currency): SQL {
  if (currency === 'EUR') return sql`true`;
  return sql`exists (select 1 from variant_prices vp where vp.variant_id = ${productVariants.id} and vp.currency = ${literal(currency)})`;
}

// The strike-through ("was") price: a EUR-only fact (sale and price history stay EUR in v1), so any
// other store shows none and the Omnibus rule can never be broken by a price we cannot prove.
export function compareAtIn(currency: string = currentStore().currency): SQL<number | null> {
  if (currency === 'EUR') return sql<number | null>`${productVariants.compareAtPriceCents}`;
  return sql<number | null>`null::int`;
}
