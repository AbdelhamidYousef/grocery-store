import { sql } from 'drizzle-orm';

import type { Tx } from '../client.ts';

// Hand-set GBP prices for the demo catalogue (EUR 19.99 -> GBP 16.99). They are WRITTEN to
// `variant_prices` once and from then on are plain data an admin edits; nothing converts at read
// time. The rule below only decides what gets typed in: about 85 % of the euro price, snapped to
// a x9 ending, never above the euro figure. (The EUR rows come from a trigger on the base column.)
export function seedGbpCents(eurCents: number): number {
  if (eurCents <= 0) return 0;
  const snapped = Math.round((eurCents * 0.85) / 10) * 10 - 1;
  return Math.min(Math.max(snapped, 9), eurCents);
}

// Insert-only: re-seeding never overwrites a price an admin changed.
export async function seedGbpPrices(tx: Tx): Promise<void> {
  const rows = await tx.execute<{ id: string; price_cents: number }>(
    sql`select v.id, v.price_cents from product_variants v
        where not exists (select 1 from variant_prices p where p.variant_id = v.id and p.currency = 'GBP')`,
  );
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await tx.execute(sql`
      insert into variant_prices (variant_id, currency, price_cents)
      values ${sql.join(
        chunk.map((r) => sql`(${r.id}::uuid, 'GBP', ${seedGbpCents(r.price_cents)})`),
        sql`, `,
      )}
      on conflict do nothing`);
  }
}
