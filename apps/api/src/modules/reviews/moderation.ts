import { db } from '../../db/client.ts';
import { notFound } from '../../lib/errors.ts';

import * as repo from './repo.ts';

// Moderation is a small state machine: pending -> approved | rejected, and an admin may later flip
// approved <-> rejected. The product's rating aggregate counts APPROVED reviews only, so it changes
// exactly when a review enters or leaves "approved", and in the same transaction as the status:
// the two can never disagree, even if the process dies half way.

async function transition(id: string, to: 'approved' | 'rejected', reason: string | null) {
  return db.transaction(async (tx) => {
    const current = await repo.lockReview(tx, id);
    if (!current) throw notFound('Review not found');
    // Repeating an action is a no-op (a double click must not count a rating twice).
    if (current.status === to) return { review: current, changed: false };

    const review = await repo.setStatus(tx, id, to, reason);
    if (to === 'approved') await repo.adjustAggregate(tx, current.productId, 1, current.rating);
    else if (current.status === 'approved') {
      await repo.adjustAggregate(tx, current.productId, -1, current.rating);
    }
    return { review, changed: true };
  });
}

export const approveReview = (id: string) => transition(id, 'approved', null);
export const rejectReview = (id: string, reason: string) => transition(id, 'rejected', reason);

// Deleting an approved review takes its rating out of the aggregate. Returns the photo paths so
// the caller can remove the files (the rows go with the review, by cascade).
export async function deleteReview(id: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const current = await repo.lockReview(tx, id);
    if (!current) throw notFound('Review not found');
    const paths = await repo.photoPathsOf(tx, id);
    if (current.status === 'approved') {
      await repo.adjustAggregate(tx, current.productId, -1, current.rating);
    }
    await repo.deleteReviewRow(tx, id);
    return paths;
  });
}
