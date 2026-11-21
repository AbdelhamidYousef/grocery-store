import type { AdminReview, ReviewStatus } from '@store/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Seo } from '../../../components/Seo';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import { cn } from '../../../lib/cn';
import { formatDate } from '../../../lib/format';
import { FormAlert } from '../../auth/AuthCard';
import { reviewContextLine } from '../../reviews/format';
import { RatingStars } from '../../reviews/RatingStars';
import { adminErrorMessage } from '../errors';

import { useAdminReviews, useApproveReview, useDeleteReview, useRejectReview } from './queries';

const TABS: { status: ReviewStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Rejected' },
];

// The moderation queue. Pending first, oldest at the top (the API orders it that way). Approve is
// one click (and can be done for a ticked selection); reject asks for a reason, which is stored.
export function ReviewsAdmin() {
  const [status, setStatus] = useState<ReviewStatus>('pending');
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch } = useAdminReviews(status, page);
  const approve = useApproveReview();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const switchTab = (next: ReviewStatus) => {
    setStatus(next);
    setPage(1);
    setSelected(new Set());
  };

  async function approveSelected() {
    setBulkBusy(true);
    let done = 0;
    for (const id of selected) {
      try {
        await approve.mutateAsync(id);
        done += 1;
      } catch (error) {
        toast.show(adminErrorMessage(error), 'error');
        break;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (done > 0) toast.show(`${done} review${done === 1 ? '' : 's'} approved`, 'success');
  }

  return (
    <section
      aria-labelledby="reviews-admin-heading"
      data-testid="admin-reviews"
      className="flex flex-col gap-4"
    >
      <Seo title="Review moderation" noindex />
      <h2 id="reviews-admin-heading" className="font-display text-xl font-bold">
        Reviews
      </h2>
      <div role="group" aria-label="Review status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.status}
            variant={status === t.status ? 'primary' : 'secondary'}
            aria-pressed={status === t.status}
            onClick={() => switchTab(t.status)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {status === 'pending' && data && data.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() =>
              setSelected(
                selected.size === data.data.length
                  ? new Set()
                  : new Set(data.data.map((r) => r.id)),
              )
            }
          >
            {selected.size === data.data.length ? 'Clear selection' : 'Select all on this page'}
          </Button>
          <Button
            disabled={selected.size === 0}
            loading={bulkBusy}
            data-testid="bulk-approve"
            onClick={() => void approveSelected()}
          >
            Approve selected ({selected.size})
          </Button>
        </div>
      )}

      {isError ? (
        <div role="alert" className="text-danger">
          We could not load the reviews.{' '}
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
          {data.data.map((review) => (
            <ReviewRow
              key={review.id}
              review={review}
              selectable={status === 'pending'}
              checked={selected.has(review.id)}
              onCheck={(on) => {
                const next = new Set(selected);
                if (on) next.add(review.id);
                else next.delete(review.id);
                setSelected(next);
              }}
            />
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

function ReviewRow({
  review,
  selectable,
  checked,
  onCheck,
}: {
  review: AdminReview;
  selectable: boolean;
  checked: boolean;
  onCheck: (on: boolean) => void;
}) {
  const approve = useApproveReview();
  const reject = useRejectReview();
  const remove = useDeleteReview();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const context = reviewContextLine(review);

  const fail = (e: unknown) => setError(adminErrorMessage(e));

  return (
    <li
      data-testid="admin-review-row"
      className={cn(
        'flex flex-col gap-2 rounded-card border border-line bg-surface p-4',
        checked && 'border-ink',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        {selectable && (
          <input
            type="checkbox"
            aria-label={`Select review "${review.title}"`}
            checked={checked}
            onChange={(e) => onCheck(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        )}
        <RatingStars tenths={review.rating * 10} size="sm" />
        <strong className="min-w-0 break-words">{review.title}</strong>
        {review.verifiedBuyer ? (
          <Badge tone="success">Verified buyer</Badge>
        ) : (
          <Badge>Not verified</Badge>
        )}
      </div>
      <p className="text-sm text-muted">
        <Link to={`/products/${review.productSlug}`} className="underline">
          {review.productName}
        </Link>{' '}
        · {review.authorName} {review.authorEmail ? `(${review.authorEmail})` : ''} ·{' '}
        {formatDate(review.createdAt)}
      </p>
      {context && <p className="text-sm font-semibold">{context}</p>}
      <p className="whitespace-pre-line break-words">{review.body}</p>
      {review.photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Photos in this review">
          {review.photos.map((p, i) => (
            <li key={p.id}>
              <a
                href={p.path}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open photo ${i + 1} full size`}
              >
                <img
                  src={p.path}
                  alt=""
                  className="h-24 w-24 rounded-control border border-line object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
      {review.status === 'rejected' && review.rejectReason && (
        <p className="text-sm">
          <strong>Reason:</strong> {review.rejectReason}
        </p>
      )}
      <FormAlert message={error} />
      {rejecting ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            reject.mutate(
              { id: review.id, reason },
              {
                onSuccess: () => toast.show('Review rejected', 'success'),
                onError: fail,
              },
            );
          }}
        >
          <Input
            label="Reason (kept on record)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="submit" variant="danger" loading={reject.isPending}>
            Confirm reject
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {review.status !== 'approved' && (
            <Button
              loading={approve.isPending}
              onClick={() => {
                setError(null);
                approve.mutate(review.id, {
                  onSuccess: () => toast.show('Review approved', 'success'),
                  onError: fail,
                });
              }}
            >
              Approve <span className="sr-only">review {review.title}</span>
            </Button>
          )}
          {review.status !== 'rejected' && (
            <Button variant="secondary" onClick={() => setRejecting(true)}>
              Reject <span className="sr-only">review {review.title}</span>
            </Button>
          )}
          <Button
            variant="secondary"
            loading={remove.isPending}
            onClick={() => {
              if (!window.confirm('Delete this review for good?')) return;
              remove.mutate(review.id, {
                onSuccess: () => toast.show('Review deleted', 'success'),
                onError: fail,
              });
            }}
          >
            Delete <span className="sr-only">review {review.title}</span>
          </Button>
        </div>
      )}
    </li>
  );
}
