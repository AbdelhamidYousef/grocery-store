import { formatMoney } from '@store/shared';

import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { TEST_IDS } from '../../lib/test-ids';

import { useAdminStats } from './queries';

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div
      className="rounded-card border-2 border-line bg-surface p-4"
      data-testid={TEST_IDS.adminStat}
    >
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="mt-1 break-words font-display text-3xl font-bold">{value}</dd>
      <dd className="mt-1 text-sm text-muted">{note}</dd>
    </div>
  );
}

export function Dashboard() {
  const { data, isPending, error, refetch } = useAdminStats();
  return (
    <section aria-labelledby="dashboard-heading">
      <Seo title="Admin dashboard" noindex />
      <h2 id="dashboard-heading" className="font-display text-xl font-bold">
        Dashboard
      </h2>
      {isPending && !error && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      )}
      {error && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load the numbers.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data && (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatTile label="Orders today" value={String(data.ordersToday)} note="Since 00:00 UTC" />
          <StatTile
            label="Revenue, last 30 days"
            value={formatMoney(data.revenue30dCents, data.currency)}
            note="Paid orders still standing"
          />
          <StatTile
            label="Low stock variants"
            value={String(data.lowStockCount)}
            note="At or below their threshold"
          />
        </dl>
      )}
    </section>
  );
}
