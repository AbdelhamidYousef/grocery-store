import type { AdminWithdrawal, WithdrawalStatus } from '@store/shared';

import { Seo } from '../../../components/Seo';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { TEST_IDS } from '../../../lib/test-ids';
import { formatWhen } from '../order-status';

import { useAdminWithdrawals, useSetWithdrawalStatus } from './queries';

const TONE: Record<WithdrawalStatus, BadgeTone> = {
  new: 'danger',
  acknowledged: 'primary',
  done: 'success',
};

const NEXT: Record<WithdrawalStatus, { to: WithdrawalStatus; label: string } | null> = {
  new: { to: 'acknowledged', label: 'Acknowledge' },
  acknowledged: { to: 'done', label: 'Mark done' },
  done: null,
};

export function WithdrawalsAdmin() {
  const { data, isPending, error, refetch } = useAdminWithdrawals();
  const set = useSetWithdrawalStatus();
  return (
    <section aria-labelledby="withdrawals-heading" data-testid="admin-withdrawals">
      <Seo title="Admin withdrawals" noindex />
      <h2 id="withdrawals-heading" className="font-display text-xl font-bold">
        Withdrawal requests
      </h2>
      <p className="mt-1 text-muted">Oldest unanswered first. Times are UTC.</p>
      {isPending && !error && <Skeleton className="mt-4 h-40 w-full rounded-card" />}
      {error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load the requests.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data && data.length === 0 && (
        <p className="mt-4 text-muted" data-testid={TEST_IDS.adminEmpty}>
          No withdrawal requests.
        </p>
      )}
      {data && data.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-card border border-line">
          {data.map((w) => (
            <WithdrawalRow
              key={w.id}
              item={w}
              pending={set.isPending && set.variables?.id === w.id}
              onMove={(status) => set.mutate({ id: w.id, status })}
            />
          ))}
        </ul>
      )}
      {set.isError && (
        <p role="alert" className="mt-2 font-semibold text-danger">
          We could not update that request. Try again.
        </p>
      )}
    </section>
  );
}

function WithdrawalRow({
  item,
  pending,
  onMove,
}: {
  item: AdminWithdrawal;
  pending: boolean;
  onMove: (status: WithdrawalStatus) => void;
}) {
  const next = NEXT[item.status];
  return (
    <li
      className="flex flex-wrap items-start justify-between gap-3 p-3"
      data-testid={TEST_IDS.adminRow}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <span>{item.reference}</span>
          <Badge tone={TONE[item.status]}>{item.status}</Badge>
        </p>
        <p className="mt-1 break-words">
          Order <span className="font-semibold">{item.orderNumber}</span> &middot; {item.email}
        </p>
        <p className="text-sm text-muted">Received {formatWhen(item.createdAt)}</p>
        <p className="mt-1 break-words">Covers: {item.itemsText ?? 'the whole order'}</p>
        {item.reason && <p className="break-words text-muted">Reason: {item.reason}</p>}
      </div>
      {next && (
        <Button
          variant="secondary"
          loading={pending}
          aria-label={`${next.label} ${item.reference}`}
          onClick={() => onMove(next.to)}
        >
          {next.label}
        </Button>
      )}
    </li>
  );
}
