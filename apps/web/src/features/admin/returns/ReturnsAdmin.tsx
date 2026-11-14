import {
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  ReturnStatusSchema,
  formatMoney,
  type ReturnStatus,
} from '@store/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Seo } from '../../../components/Seo';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { formatDate } from '../../../lib/format';
import { TEST_IDS } from '../../../lib/test-ids';

import { useAdminReturns } from './queries';
import { RETURN_TONE } from './tone';

const TABS: { status: ReturnStatus | undefined; label: string }[] = [
  { status: 'requested', label: 'To review' },
  ...ReturnStatusSchema.options
    .filter((s) => s !== 'requested')
    .map((s) => ({ status: s, label: RETURN_STATUS_LABELS[s] })),
  { status: undefined, label: 'All' },
];

// The returns queue: what needs a decision first, the other states one tab away.
export function ReturnsAdmin() {
  const [status, setStatus] = useState<ReturnStatus | undefined>('requested');
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch } = useAdminReturns(status, page);

  return (
    <section aria-labelledby="returns-admin-heading" className="flex flex-col gap-4">
      <Seo title="Returns" noindex />
      <h2 id="returns-admin-heading" className="font-display text-xl font-bold">
        Returns
      </h2>
      <div role="group" aria-label="Return status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.label}
            variant={status === t.status ? 'primary' : 'secondary'}
            aria-pressed={status === t.status}
            onClick={() => {
              setStatus(t.status);
              setPage(1);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {isError ? (
        <div role="alert" className="text-danger">
          We could not load the returns.{' '}
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : data.data.length === 0 ? (
        <p className="text-muted">No returns here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.data.map((r) => (
            <li
              key={r.id}
              data-testid={TEST_IDS.adminReturnRow}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-line bg-surface p-3"
            >
              <Link
                to={`/admin/returns/${r.id}`}
                className="font-semibold text-primary-strong underline"
              >
                {r.orderNumber}
              </Link>
              <Badge tone={RETURN_TONE[r.status]}>{RETURN_STATUS_LABELS[r.status]}</Badge>
              <span className="min-w-0 break-all text-sm text-muted">{r.email}</span>
              <span className="text-sm">
                {r.itemCount} item{r.itemCount === 1 ? '' : 's'} · {RETURN_REASON_LABELS[r.reason]}
              </span>
              <span className="ml-auto font-semibold">
                {formatMoney(r.refundCents, r.currency)}
              </span>
              <span className="text-sm text-muted">{formatDate(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {data.meta.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
