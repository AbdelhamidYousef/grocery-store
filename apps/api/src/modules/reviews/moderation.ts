import { db } from '../../db/client.ts';
import { notFound } from '../../lib/errors.ts';
import { removeUnreferencedPhotos } from '../../lib/upload-refs.ts';
import type { UploadConfig } from '../../lib/uploads.ts';
import { enqueueEmail, type Outbox } from '../mail/outbox.ts';

import * as repo from './repo.ts';

// Moderation is a small state machine: pending -> approved | rejected, and an admin may later flip
// approved <-> rejected. The product's rating aggregate counts APPROVED reviews only, so it changes
// exactly when a review enters or leaves "approved", and in the same transaction as the status:
// the two can never disagree, even if the process dies half way.

async function transition(
  id: string,
  to: 'approved' | 'rejected',
  reason: string | null,
  outbox?: Outbox,
  uploads?: UploadConfig,
) {
  const result = await db.transaction(async (tx) => {
    const current = await repo.lockReview(tx, id);
    if (!current) throw notFound('Review not found');
    // Repeating an action is a no-op (a double click must not count a rating twice).
    if (current.status === to) return { review: current, changed: false, freedPaths: [] };

    const review = await repo.setStatus(tx, id, to, reason);
    // A rejected review is never shown, so its photos must not stay public on the uploads mount.
    // The rows go with it (an admin who flips it back to approved gets the text, not the pictures).
    let freedPaths: string[] = [];
    if (to === 'rejected') {
      freedPaths = await repo.photoPathsOf(tx, id);
      await repo.deletePhotoRows(tx, id);
    }
    if (to === 'approved') {
      await repo.adjustAggregate(tx, current.productId, 1, current.rating);
      // The thank-you is queued in the same transaction as the approval (see the outbox): it goes
      // out if and only if the approval is committed, and at most once per review.
      const who = await repo.emailContext(tx, id);
      if (who) {
        await enqueueEmail(tx, {
          kind: 'review_approved',
          to: who.email,
          payload: {
            firstName: who.firstName,
            productName: who.productName,
            productSlug: who.productSlug,
          },
          dedupeKey: `review_approved:${id}`,
        });
      }
    } else if (current.status === 'approved') {
      await repo.adjustAggregate(tx, current.productId, -1, current.rating);
    }
    return { review, changed: true, freedPaths };
  });
  if (result.changed) outbox?.kick();
  if (result.freedPaths.length > 0 && uploads) {
    await removeUnreferencedPhotos(uploads, result.freedPaths);
  }
  return { review: result.review, changed: result.changed };
}

export const approveReview = (id: string, outbox?: Outbox) =>
  transition(id, 'approved', null, outbox);
export const rejectReview = (id: string, reason: string, uploads?: UploadConfig) =>
  transition(id, 'rejected', reason, undefined, uploads);

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
