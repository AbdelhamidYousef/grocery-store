import { isPaidOrLater, OrderStatusSchema, STORE_TIME_ZONE } from '@store/shared';
import { sql } from 'drizzle-orm';

import { db } from '../../../db/client.ts';

// Statuses that count as a sale: the shared rule, so a status added later is decided in one place.
const PAID = OrderStatusSchema.options.filter(isPaidOrLater);
const paidList = sql`(${sql.join(
  PAID.map((s) => sql`${s}::order_status`),
  sql`, `,
)})`;

// All dates are the shop's calendar days. `placed_at` is converted to local time once, and the
// range is half-open: [from 00:00, day after `to` 00:00).
const placedLocal = sql`(o.placed_at at time zone ${STORE_TIME_ZONE})`;
// Only orders of the report's currency: figures of different currencies are never added together.
const inRange = (r: Range) =>
  sql`o.currency = ${r.currency} and ${placedLocal} >= ${r.from}::date and ${placedLocal} < (${r.to}::date + 1)`;

export interface Range {
  from: string;
  to: string;
  currency: string;
}

export async function todayInStore(): Promise<string> {
  const rows = await db.execute<{ d: string }>(
    sql`select ((now() at time zone ${STORE_TIME_ZONE})::date)::text as d`,
  );
  return rows[0]?.d ?? new Date().toISOString().slice(0, 10);
}

// Net revenue of one order: what was charged, minus the round-up donation (it belongs to the
// shelter, never the shop), minus what was handed back. Returns never refund the round-up and a
// whole-order refund refunds everything (refunded = total), so clamping at zero is exact.
const NET_REVENUE = sql`greatest(o.total_cents - o.donation_cents - o.refunded_cents, 0)`;

// One row per bucket, empty buckets included (a chart needs the zero days). Revenue is NET (above).
export async function revenueSeries(range: Range, interval: 'day' | 'week' | 'month') {
  return db.execute<{ bucket: string; revenue_cents: number; orders: number }>(sql`
    with b as (
      select generate_series(
        date_trunc(${interval}, ${range.from}::timestamp),
        ${range.to}::timestamp,
        ('1 ' || ${interval})::interval
      ) as bucket
    )
    select to_char(b.bucket, 'YYYY-MM-DD') as bucket,
      coalesce(sum(${NET_REVENUE}), 0)::int as revenue_cents,
      count(o.id)::int as orders
    from b
    left join orders o
      on date_trunc(${interval}, ${placedLocal}) = b.bucket
      and o.status in ${paidList}
      and ${inRange(range)}
    group by b.bucket
    order by b.bucket
  `);
}

// Orders and net revenue of the range, and the average order value in ONE statement: integer
// division rounded half up is (2 * revenue + n) / (2 * n), no floats anywhere.
export async function totals(range: Range) {
  const rows = await db.execute<{ orders: number; revenue: string; aov: string }>(sql`
    select count(*)::int as orders,
      coalesce(sum(${NET_REVENUE}), 0)::bigint as revenue,
      case when count(*) = 0 then 0
        else (2 * sum(${NET_REVENUE}) + count(*)) / (2 * count(*)) end::bigint as aov
    from orders o
    where o.status in ${paidList} and ${inRange(range)}
  `);
  const r = rows[0];
  return { orders: r?.orders ?? 0, revenue: Number(r?.revenue ?? 0), aov: Number(r?.aov ?? 0) };
}

// Per product: units and revenue of the lines sold in the range, minus what refunded returns took
// back. A wholly refunded order is not a sale, so it is left out. A deleted product still reports
// under the name the order kept.
export async function topProducts(range: Range, by: 'units' | 'revenue', limit: number | null) {
  const order =
    by === 'units' ? sql`units desc, revenue_cents desc` : sql`revenue_cents desc, units desc`;
  return db.execute<{
    product_id: string | null;
    name: string;
    units: number;
    revenue_cents: number;
  }>(sql`
    select p.id::text as product_id,
      coalesce(p.name, oi.product_name) as name,
      sum(oi.quantity - coalesce(r.qty, 0))::int as units,
      sum(oi.line_total_cents - oi.discount_cents - coalesce(r.cents, 0))::int as revenue_cents
    from order_items oi
    join orders o on o.id = oi.order_id
    left join product_variants v on v.id = oi.variant_id
    left join products p on p.id = v.product_id
    left join (
      select ri.order_item_id, sum(ri.quantity) as qty, sum(ri.refund_cents) as cents
      from return_items ri join returns rt on rt.id = ri.return_id
      where rt.status = 'refunded'
      group by ri.order_item_id
    ) r on r.order_item_id = oi.id
    where o.status in ${paidList} and o.status <> 'refunded' and ${inRange(range)}
    group by p.id, coalesce(p.name, oi.product_name)
    having sum(oi.quantity - coalesce(r.qty, 0)) > 0
    order by ${order}, name
    ${limit === null ? sql`` : sql`limit ${limit}`}
  `);
}

export async function lowStock(threshold: number, limit: number | null) {
  return db.execute<{
    variant_id: string;
    product_id: string;
    sku: string;
    product_name: string;
    variant_name: string;
    store_slug: string;
    store_name: string;
    available: number;
  }>(sql`
    select v.id::text as variant_id, p.id::text as product_id, v.sku,
      p.name as product_name, v.name as variant_name, s.slug as store_slug, s.name as store_name,
      (i.quantity - i.reserved)::int as available
    from inventory i
    join dark_stores s on s.id = i.store_id
    join product_variants v on v.id = i.variant_id
    join products p on p.id = v.product_id
    where v.status = 'active' and p.status = 'active' and (i.quantity - i.reserved) <= ${threshold}
    order by available asc, p.name asc, v.sku asc, s.name asc
    ${limit === null ? sql`` : sql`limit ${limit}`}
  `);
}

// Returned units (parcel received or refunded) against units delivered, for orders placed in the
// range; basis points, integer, half up: (2 * 10000 * returned + delivered) / (2 * delivered).
export async function returnsRate(range: Range) {
  const rows = await db.execute<{ returned: string; delivered: string; rate_bp: string }>(sql`
    with delivered as (
      select coalesce(sum(oi.quantity), 0) as units
      from order_items oi join orders o on o.id = oi.order_id
      where ${inRange(range)}
        and exists (select 1 from order_status_history h
                    where h.order_id = o.id and h.to_status = 'delivered')
    ), returned as (
      select coalesce(sum(ri.quantity), 0) as units
      from return_items ri
      join returns rt on rt.id = ri.return_id
      join orders o on o.id = rt.order_id
      where rt.status in ('received', 'refunded') and ${inRange(range)}
    )
    select returned.units::bigint as returned, delivered.units::bigint as delivered,
      case when delivered.units = 0 then 0
        else (2 * 10000 * returned.units + delivered.units) / (2 * delivered.units) end::bigint as rate_bp
    from delivered, returned
  `);
  const r = rows[0];
  return {
    returned: Number(r?.returned ?? 0),
    delivered: Number(r?.delivered ?? 0),
    rateBp: Number(r?.rate_bp ?? 0),
  };
}

// CSV source: paid-or-later orders of the range, a page at a time (the export streams them).
export async function orderRows(range: Range, limit: number, offset: number) {
  return db.execute<{
    number: string;
    placed_at: string;
    status: string;
    email: string;
    units: number;
    total_cents: number;
    donation_cents: number;
    refunded_cents: number;
    net_cents: number;
  }>(sql`
    select o.number, to_char(o.placed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as placed_at,
      o.status::text as status, o.email::text as email,
      (select coalesce(sum(oi.quantity), 0)::int from order_items oi where oi.order_id = o.id) as units,
      o.total_cents, o.donation_cents, o.refunded_cents,
      ${NET_REVENUE}::int as net_cents
    from orders o
    where o.status in ${paidList} and ${inRange(range)}
    order by o.placed_at, o.id
    limit ${limit} offset ${offset}
  `);
}
