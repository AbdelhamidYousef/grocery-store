import { formatMoney, type AdminVetApproval, type VetDecision } from '@store/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Seo } from '../../../components/Seo';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import { formatDate } from '../../../lib/format';
import { TEST_IDS } from '../../../lib/test-ids';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';

import { useAdminVetApprovals, useVetDecision } from './queries';

const TABS: { decision: VetDecision; label: string }[] = [
  { decision: 'pending', label: 'Waiting' },
  { decision: 'approved', label: 'Approved' },
  { decision: 'rejected', label: 'Rejected' },
];

// The queue of orders held for a (simulated) vet decision. Approving logs a made-up confirmation
// code and sends the order to packing; rejecting asks for a reason, cancels and refunds.
export function VetApprovalsAdmin() {
  const [decision, setDecision] = useState<VetDecision>('pending');
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch } = useAdminVetApprovals(decision, page);

  return (
    <section aria-labelledby="vet-admin-heading" className="flex flex-col gap-4">
      <Seo title="Vet approvals" noindex />
      <h2 id="vet-admin-heading" className="font-display text-xl font-bold">
        Vet approvals
      </h2>
      <p className="text-sm text-muted">
        Demo: a decision here stands in for a vet&apos;s answer. Nobody is emailed and the
        confirmation code is made up.
      </p>
      <div role="group" aria-label="Decision" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.decision}
            variant={decision === t.decision ? 'primary' : 'secondary'}
            aria-pressed={decision === t.decision}
            onClick={() => {
              setDecision(t.decision);
              setPage(1);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {isError ? (
        <div role="alert" className="text-danger">
          We could not load the queue.{' '}
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : data.data.length === 0 ? (
        <p className="text-muted">Nothing in this queue.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.data.map((a) => (
            <VetRow key={a.orderNumber} approval={a} />
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

function VetRow({ approval: a }: { approval: AdminVetApproval }) {
  const decide = useVetDecision(a.orderNumber);
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = (input: Parameters<typeof decide.mutate>[0], done: string) => {
    setError(null);
    decide.mutate(input, {
      onSuccess: () => toast.show(done, 'success'),
      onError: (e) => setError(adminErrorMessage(e)),
    });
  };

  return (
    <li
      data-testid={TEST_IDS.adminVetRow}
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={`/admin/orders/${a.orderNumber}`}
          className="font-semibold text-primary-strong underline"
        >
          {a.orderNumber}
        </Link>
        <Badge
          tone={
            a.decision === 'approved' ? 'success' : a.decision === 'rejected' ? 'danger' : 'pet'
          }
        >
          {a.decision === 'pending' ? 'Waiting for vet' : a.decision}
        </Badge>
        <span className="ml-auto font-semibold">{formatMoney(a.totalCents, a.currency)}</span>
      </div>
      <p className="text-sm text-muted">
        {a.email}
        {a.placedAt && ` · paid ${formatDate(a.placedAt, true)}`}
      </p>
      <p className="break-words">
        <strong>Vet:</strong> {a.vetName}, {a.clinic} ({a.vetEmail})
      </p>
      <ul className="list-inside list-disc text-sm">
        {a.items.map((i) => (
          <li key={`${i.productName}-${i.variantName}`}>
            {i.quantity} × {i.productName} ({i.variantName})
          </li>
        ))}
      </ul>
      {a.decision === 'approved' && (
        <p className="text-sm">
          Approved by {a.decidedBy}. Confirmation <code>{a.confirmationCode}</code> (simulated).
        </p>
      )}
      {a.decision === 'rejected' && (
        <p className="text-sm">
          Rejected by {a.decidedBy}: {a.reason}
        </p>
      )}
      <FormAlert message={error} />
      {a.decision === 'pending' &&
        (rejecting ? (
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              run({ action: 'reject', reason }, 'Order rejected and refunded');
            }}
          >
            <Input
              label="Reason (the customer sees it)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button type="submit" variant="danger" loading={decide.isPending}>
              Confirm reject and refund
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {a.simulatedMode && (
              <p role="note" className="w-full rounded-control bg-pet-soft p-2 text-sm">
                Demo mode: a rejection records a simulated refund and moves no money.
              </p>
            )}
            <Button
              loading={decide.isPending}
              onClick={() => run({ action: 'approve' }, 'Order approved')}
            >
              Approve <span className="sr-only">order {a.orderNumber}</span>
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(true)}>
              Reject <span className="sr-only">order {a.orderNumber}</span>
            </Button>
          </div>
        ))}
    </li>
  );
}
