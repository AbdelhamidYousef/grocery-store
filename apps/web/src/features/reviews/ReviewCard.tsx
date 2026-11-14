import type { Review } from '@store/shared';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { formatDate } from '../../lib/format';
import { loginUrl } from '../../lib/safe-next';
import { TEST_IDS } from '../../lib/test-ids';
import { useAuth } from '../auth/AuthProvider';

import { petContextLine } from './format';
import { useHelpful } from './queries';
import { RatingStars } from './RatingStars';

// Text is rendered as text (React escapes it): reviews are stored raw and may contain anything.
export function ReviewCard({ review }: { review: Review }) {
  const { status } = useAuth();
  const location = useLocation();
  const helpful = useHelpful();
  const [open, setOpen] = useState<string | null>(null);
  const context = petContextLine(review);

  return (
    <li
      data-testid={TEST_IDS.reviewCard}
      className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RatingStars tenths={review.rating * 10} size="sm" />
        <h3 className="min-w-0 break-words font-display text-lg font-bold">{review.title}</h3>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span>{review.authorName}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
        {review.verifiedBuyer && (
          <Badge tone="success" data-testid={TEST_IDS.reviewVerified}>
            Verified buyer
          </Badge>
        )}
      </p>
      {context && <p className="text-sm font-semibold text-pet-strong">{context}</p>}
      <p className="whitespace-pre-line break-words">{review.body}</p>
      <p className="text-sm">{review.wouldRecommend ? 'Would recommend' : 'Would not recommend'}</p>

      {review.photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Customer photos">
          {review.photos.map((photo, i) => (
            <li key={photo.id}>
              <button
                type="button"
                data-testid={TEST_IDS.reviewPhoto}
                aria-label={`Open photo ${i + 1} of ${review.photos.length}`}
                onClick={() => setOpen(photo.path)}
                className="block h-20 w-20 overflow-hidden rounded-control border border-line"
              >
                <img
                  src={photo.path}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open !== null} onClose={() => setOpen(null)} title="Customer photo">
        {open && (
          <img
            src={open}
            alt={`Photo from ${review.authorName}'s review: ${review.title}`}
            className="max-h-[75vh] w-full object-contain"
          />
        )}
      </Dialog>

      <div className="flex flex-wrap items-center gap-3">
        {status === 'authenticated' ? (
          <Button
            variant="secondary"
            size="sm"
            data-testid={TEST_IDS.reviewHelpful}
            aria-pressed={review.votedHelpful}
            loading={helpful.isPending}
            onClick={() => helpful.mutate(review.id)}
          >
            {review.votedHelpful ? 'Marked helpful' : 'Helpful'} ({review.helpfulCount})
          </Button>
        ) : (
          <Link
            to={loginUrl(`${location.pathname}${location.search}#reviews`)}
            className="text-sm font-semibold underline"
          >
            Sign in to mark helpful ({review.helpfulCount})
          </Link>
        )}
        {helpful.isError && (
          <span role="alert" className="text-sm font-semibold text-danger">
            {helpful.error.message}
          </span>
        )}
      </div>
    </li>
  );
}
