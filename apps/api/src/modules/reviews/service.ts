import { OrderStatusSchema, isPaidOrLater, type ReviewInput } from '@store/shared';

import { db } from '../../db/client.ts';
import { uniqueViolation } from '../../lib/db-errors.ts';
import { conflict, notFound, validation } from '../../lib/errors.ts';
import { removePhotos, savePhoto, type UploadConfig } from '../../lib/uploads.ts';

import * as repo from './repo.ts';

const PAID_STATUSES = OrderStatusSchema.options.filter(isPaidOrLater);

export type CreateReviewResult = { id: string; status: 'pending'; verifiedBuyer: boolean };

// `verified_buyer` is decided HERE, from the database, and never read from the request: a trust
// badge the client could set would be worth nothing. A new review is always `pending`; only a
// moderator moves it on (17.6), so nothing a stranger types reaches the public page unreviewed.
export async function createReview(
  userId: string,
  slug: string,
  input: ReviewInput,
  upload?: { files: Buffer[]; config: UploadConfig },
): Promise<CreateReviewResult> {
  const product = await repo.findActiveProduct(slug);
  if (!product) throw notFound('Product not found');

  const orderId = await repo.findPaidOrderId(userId, product.id, PAID_STATUSES);

  const files = upload?.files ?? [];
  if (files.length > 0 && !upload?.config.enabled) {
    throw validation(undefined, 'Photo upload is switched off in this demo.');
  }
  // Photos are written before the insert so the row never points at a missing file; if the insert
  // then fails (duplicate review), the files are removed again.
  const photoPaths: string[] = [];
  try {
    for (const file of files) photoPaths.push(await savePhoto(upload!.config, file));
  } catch (err) {
    await removePhotos(upload!.config, photoPaths);
    throw err;
  }

  try {
    const row = await db.transaction(async (tx) => {
      const review = await repo.insertReview(tx, {
        productId: product.id,
        userId,
        orderId: orderId ?? null,
        rating: input.rating,
        title: input.title,
        body: input.body,
        verifiedBuyer: orderId !== undefined,
        petAgeMonths: input.petAgeMonths ?? null,
        petWeightG: input.petWeightG ?? null,
        sizePurchased: input.sizePurchased ?? null,
        wouldRecommend: input.wouldRecommend,
        status: 'pending',
      });
      if (photoPaths.length > 0) await repo.insertPhotos(tx, review.id, photoPaths);
      return review;
    });
    return { id: row.id, status: 'pending', verifiedBuyer: row.verifiedBuyer };
  } catch (err) {
    if (upload) await removePhotos(upload.config, photoPaths);
    // The unique (user, product) index is the real guard; a pre-check would race.
    if (uniqueViolation(err) === 'reviews_user_product_unique') {
      throw conflict('CONFLICT', 'You have already reviewed this product.');
    }
    throw err;
  }
}
