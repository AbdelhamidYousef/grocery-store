import { Link } from 'react-router-dom';

import { Seo } from '../../../components/Seo';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Button, buttonClasses } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { TEST_IDS } from '../../../lib/test-ids';
import { formatWhen } from '../order-status';

import { useAdminSafetyNotices } from './queries';

const TONE: Record<string, BadgeTone> = { recall: 'danger', warning: 'primary', info: 'neutral' };

export function SafetyList() {
  const { data, isPending, error, refetch } = useAdminSafetyNotices();
  return (
    <section aria-labelledby="safety-heading" data-testid="admin-safety">
      <Seo title="Admin safety notices" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="safety-heading" className="font-display text-xl font-bold">
          Safety notices
        </h2>
        <Link to="/admin/safety/new" className={buttonClasses('primary', 'md')}>
          New notice
        </Link>
      </div>
      {isPending && !error && <Skeleton className="mt-4 h-40 w-full rounded-card" />}
      {error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load the safety notices.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data && data.length === 0 && (
        <p className="mt-4 text-muted" data-testid={TEST_IDS.adminEmpty}>
          No safety notices.
        </p>
      )}
      {data && data.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-card border border-line">
          {data.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <Link
                  to={`/admin/safety/${n.id}`}
                  className="break-words font-semibold text-primary-strong underline"
                >
                  {n.title}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <Badge tone={TONE[n.severity] ?? 'neutral'}>{n.severity}</Badge>
                  <Badge tone={n.isActive ? 'success' : 'neutral'}>
                    {n.isActive ? 'showing now' : n.status === 'draft' ? 'draft' : 'not showing'}
                  </Badge>
                  <span>from {formatWhen(n.startsAt)}</span>
                  <span>
                    {n.deliveryCount} {n.deliveryCount === 1 ? 'buyer' : 'buyers'} emailed
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
