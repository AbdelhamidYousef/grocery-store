import { formatMoney, type AdminAnalytics } from '@store/shared';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';

import { analyticsCsvUrl } from '../../../api/admin-analytics';
import { Seo } from '../../../components/Seo';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { TEST_IDS } from '../../../lib/test-ids';

import { useAdminAnalytics } from './queries';
import { formatBasisPoints, intervalFor, parsePreset, PRESETS, rangeFor } from './range';
import { RevenueChart } from './RevenueChart';

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div
      data-testid={TEST_IDS.analyticsKpi}
      className="rounded-card border-2 border-line bg-surface p-4"
    >
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="mt-1 break-words font-display text-2xl font-bold sm:text-3xl">{value}</dd>
      <dd className="mt-1 text-sm text-muted">{note}</dd>
    </div>
  );
}

function ProductTable({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: AdminAnalytics['topByUnits'];
  currency: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-muted">No sales in this period.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left">
            <thead>
              <tr className="border-b-2 border-line text-sm text-muted">
                <th scope="col" className="py-1 pr-2">
                  Product
                </th>
                <th scope="col" className="py-1 pr-2 text-right">
                  Units
                </th>
                <th scope="col" className="py-1 text-right">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.productId ?? ''}-${r.name}`}
                  data-testid={TEST_IDS.analyticsTopProduct}
                  className="border-b border-line"
                >
                  <td className="break-words py-1.5 pr-2">{r.name}</td>
                  <td className="py-1.5 pr-2 text-right">{r.units}</td>
                  <td className="py-1.5 text-right">{formatMoney(r.revenueCents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Sales, products, stock and returns for a chosen period. The period is a preset in the URL
// (`?days=7|30|90`); every figure comes from the API in integer cents, and this page only
// formats them. CSV downloads are plain links to the streamed export.
export function AnalyticsDashboard() {
  const [search, setSearch] = useSearchParams();
  const days = parsePreset(search.get('days'));
  const { from, to } = rangeFor(days);
  const { data, isPending, isError, refetch } = useAdminAnalytics(from, to, intervalFor(days));

  return (
    <section aria-labelledby="analytics-heading" className="flex flex-col gap-6">
      <Seo title="Analytics" noindex />
      <h2 id="analytics-heading" className="font-display text-xl font-bold">
        Analytics
      </h2>
      <div role="group" aria-label="Period" className="flex flex-wrap items-center gap-2">
        {PRESETS.map((n) => (
          <Button
            key={n}
            variant={days === n ? 'primary' : 'secondary'}
            aria-pressed={days === n}
            onClick={() => setSearch(n === 30 ? {} : { days: String(n) }, { replace: true })}
          >
            Last {n} days
          </Button>
        ))}
        <span className="text-sm text-muted">
          {from} to {to}
        </span>
      </div>

      {isError ? (
        <div role="alert">
          <p className="font-semibold text-danger">We could not load the analytics.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          <p className="sr-only" role="status">
            Loading analytics
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-56 w-full rounded-card" />
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Revenue"
              value={formatMoney(data.revenue.totalCents, data.currency)}
              note="Paid orders, minus refunds"
            />
            <Kpi label="Orders" value={String(data.orders)} note="Paid in this period" />
            <Kpi
              label="Average order"
              value={formatMoney(data.aovCents, data.currency)}
              note="Revenue / orders"
            />
            <Kpi
              label="Returns rate"
              value={formatBasisPoints(data.returns.rateBp)}
              note={`${data.returns.returnedUnits} of ${data.returns.deliveredUnits} delivered units`}
            />
          </dl>

          <div>
            <h3 className="font-display text-lg font-bold">Revenue per {intervalFor(days)}</h3>
            {data.orders === 0 && (
              <p className="mt-1 text-muted" data-testid="analytics-empty">
                No paid orders in this period yet.
              </p>
            )}
            <div className="mt-2 rounded-card border-2 border-line bg-surface p-3">
              <RevenueChart points={data.revenue.series} currency={data.currency} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ProductTable
              title="Top products by units"
              rows={data.topByUnits}
              currency={data.currency}
            />
            <ProductTable
              title="Top products by revenue"
              rows={data.topByRevenue}
              currency={data.currency}
            />
          </div>

          <div data-testid={TEST_IDS.analyticsLowStock}>
            <h3 className="font-display text-lg font-bold">
              Low stock (at most {data.lowStockThreshold} left)
            </h3>
            {data.lowStock.length === 0 ? (
              <p className="mt-2 text-muted">Nothing is running low.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[20rem] text-left">
                  <thead>
                    <tr className="border-b-2 border-line text-sm text-muted">
                      <th scope="col" className="py-1 pr-2">
                        Variant
                      </th>
                      <th scope="col" className="py-1 pr-2">
                        SKU
                      </th>
                      <th scope="col" className="py-1 text-right">
                        Available
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lowStock.map((v) => (
                      <tr key={v.variantId} className="border-b border-line">
                        <td className="break-words py-1.5 pr-2">
                          <Link
                            to={`/admin/products/${v.productId}`}
                            className="font-semibold text-primary-strong underline"
                          >
                            {v.productName}
                          </Link>{' '}
                          ({v.variantName})
                        </td>
                        <td className="py-1.5 pr-2">{v.sku}</td>
                        <td className="py-1.5 text-right font-semibold">{v.available}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-display text-lg font-bold">Download CSV</h3>
            <p className="text-sm text-muted">
              Amounts are in cents, with a formatted column next to each.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ['orders', 'Orders CSV'],
                  ['products', 'Products CSV'],
                  ['low-stock', 'Low stock CSV'],
                ] as const
              ).map(([report, label]) => (
                <a
                  key={report}
                  href={analyticsCsvUrl(report, from, to)}
                  download
                  className="inline-flex min-h-11 items-center rounded-control border-2 border-line px-4 font-display font-semibold hover:bg-pet-soft"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
