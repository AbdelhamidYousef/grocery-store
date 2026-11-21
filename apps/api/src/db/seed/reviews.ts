import { inArray, sql } from 'drizzle-orm';

import type { Tx } from '../client.ts';
import { reviewPhotos, reviews, users } from '../schema/index.ts';

import type { ProductSeed } from './expand.ts';
import { imageRowsFor } from './images.ts';

// Phase 17 demo content: 60 invented reviews spread over 30 products (mixed ratings, some
// pending or rejected, some with a photo). Everything is
// generated deterministically from a fixed seed, so every run (and every machine) gets the same
// rows and the seed stays idempotent. No real person or brand: reviewers are made-up names on the
// reserved `.test` domain.
//
// Photos reuse the catalogue's own product pictures (`/products/...`, already committed and
// credited in apps/web/public/products/CREDITS.md): no new art, and nothing to keep in step.

export const REVIEWER_EMAIL_DOMAIN = '@grocery.test';
const REVIEWER_NAMES: [string, string][] = [
  ['Mara', 'Kowalski'],
  ['Jonas', 'Berg'],
  ['Priya', 'Nair'],
  ['Tom', 'Hughes'],
  ['Elena', 'Rossi'],
  ['Kasper', 'Lund'],
  ['Amara', 'Okafor'],
  ['Lucas', 'Meyer'],
  ['Sofia', 'Alvarez'],
  ['Noah', 'Brandt'],
  ['Ines', 'Duarte'],
  ['Felix', 'Wagner'],
  ['Hana', 'Sato'],
  ['Oskar', 'Virtanen'],
];
const reviewerEmail = (i: number) =>
  `reviewer${String(i + 1).padStart(2, '0')}${REVIEWER_EMAIL_DOMAIN}`;

// Small deterministic generator (mulberry32): same numbers on every run.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Phrases are shared on purpose: the topic chips only show words that three different reviews use.
const POSITIVE = [
  'Really fresh and it arrived quickly.',
  'Great value for the price, I would buy it again.',
  'Packed carefully and still cold when it arrived.',
  'The quality is much better than I expected.',
  'Tastes great and the pack size is just right.',
  'Honestly the best shop we have tried this year.',
  'Easy to order and the delivery was on time.',
];
const MIXED = [
  'Decent quality for the price, though the pack is a little small.',
  'It does the job but I expected it to taste better.',
  'Good idea and easy to order, but it took a while to arrive.',
];
const NEGATIVE = [
  'Disappointed, it was not as fresh as I hoped.',
  'The pack was smaller than the photo suggests and it was not good value.',
];
// One department-specific line per review, so the text reads like the product it is about.
const DEPARTMENT_LINES: Record<string, string[]> = {
  'fruit-veg': ['Ripe the day it arrived.', 'Lasted the whole week in the fridge.'],
  bakery: ['Still soft on the inside and crisp outside.', 'Even better toasted the next day.'],
  'dairy-eggs': [
    'Cold and well packed, not a crack in the eggs.',
    'Tastes like it comes from a farm.',
  ],
  'meat-fish': ['Looked and smelled fresh, cooked beautifully.', 'Good cut and sensible portion.'],
  pantry: [
    'A staple we now order every week.',
    'Does what it says and costs less than the supermarket.',
  ],
  frozen: ['Arrived completely frozen.', 'No ice crystals, the packaging held up.'],
  drinks: ['Cold and fizzy, just right.', 'Heavy bottles carried to the door, thank you.'],
  'snacks-sweets': ['Gone within a day in our house.', 'A good snack for the price.'],
  household: ['Works well and does not smell too strong.', 'Good value for a big pack.'],
  'personal-care-baby': ['Gentle and no skin trouble.', 'Exactly the brand I look for.'],
};
const TITLES: Record<'good' | 'mixed' | 'bad', string[]> = {
  good: ['Love it', 'Great buy', 'Exactly what we needed', 'Worth every cent', 'Highly recommend'],
  mixed: ['Good, not perfect', 'Does the job', 'Fine for the price'],
  bad: ['Not for us', 'Disappointing', 'Expected better'],
};
const REJECT_REASONS = ['Contains a link to another shop', 'Not about this product'];

export const SEEDED_REVIEW_TARGET = 60;
const PRODUCT_COUNT = 30;

export async function seedReviews(
  tx: Tx,
  opts: {
    products: readonly ProductSeed[];
    productId: ReadonlyMap<string, string>;
    passwordHash: string;
    now: Date;
  },
) {
  const { products, productId, passwordHash, now } = opts;
  const rand = rng(17);
  const DAY = 24 * 60 * 60 * 1000;

  // ---- reviewers ----
  const reviewerRows = await tx
    .insert(users)
    .values(
      REVIEWER_NAMES.map(([firstName, lastName], i) => ({
        email: reviewerEmail(i),
        firstName,
        lastName,
        passwordHash,
      })),
    )
    .onConflictDoUpdate({
      target: users.email,
      set: {
        firstName: sql.raw('excluded."first_name"'),
        lastName: sql.raw('excluded."last_name"'),
      },
    })
    .returning({ id: users.id, email: users.email });
  const reviewerId = (i: number) => {
    const row = reviewerRows.find((r) => r.email === reviewerEmail(i));
    if (!row) throw new Error(`reviewer ${i} was not inserted`);
    return row.id;
  };

  // Re-running replaces the seeded reviews only (their photos and votes go by cascade); reviews
  // written by anyone else, including e2e and real use, stay.
  await tx.delete(reviews).where(
    inArray(
      reviews.userId,
      reviewerRows.map((r) => r.id),
    ),
  );

  // ---- reviews ----
  // The first four products have real photos (a review may carry one); the rest are spread evenly.
  const photoProducts = 4;
  const step = Math.floor((products.length - photoProducts) / (PRODUCT_COUNT - photoProducts));
  const chosen = [
    ...products.slice(0, photoProducts),
    ...Array.from(
      { length: PRODUCT_COUNT - photoProducts },
      (_, i) => products[photoProducts + i * step]!,
    ),
  ];
  const counts = Array.from({ length: PRODUCT_COUNT }, () => 2); // 30 x 2 = 60
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;

  let total = 0;
  const approvedByProduct = new Map<string, { count: number; sum: number }>();
  for (const [p, product] of chosen.entries()) {
    const pid = productId.get(product.slug);
    if (!pid) throw new Error(`product ${product.slug} was not inserted`);
    for (let k = 0; k < (counts[p] ?? 2) && total < SEEDED_REVIEW_TARGET; k++, total++) {
      const roll = rand();
      const rating = roll < 0.45 ? 5 : roll < 0.75 ? 4 : roll < 0.87 ? 3 : roll < 0.95 ? 2 : 1;
      const tone = rating >= 4 ? 'good' : rating === 3 ? 'mixed' : 'bad';
      const sentences = [
        pick(DEPARTMENT_LINES[product.department] ?? POSITIVE),
        pick(tone === 'good' ? POSITIVE : tone === 'mixed' ? MIXED : NEGATIVE),
        ...(tone === 'good' && rand() < 0.6 ? [pick(POSITIVE)] : []),
      ];
      const s = rand();
      // Mostly approved; a few waiting, a couple turned down.
      const status = s < 0.78 ? 'approved' : s < 0.92 ? 'pending' : 'rejected';
      const helpful = status === 'approved' ? Math.floor(rand() * rand() * 15) : 0;
      const createdAt = new Date(now.getTime() - Math.floor(1 + rand() * 180) * DAY);

      const [row] = await tx
        .insert(reviews)
        .values({
          productId: pid,
          userId: reviewerId((p * 3 + k) % REVIEWER_NAMES.length),
          rating,
          title: pick(TITLES[tone]),
          body: [...new Set(sentences)].join(' '),
          // Seeded reviews carry the flag without an order: the demo has no purchase history to
          // point at (real ones get `order_id` from the paid order, see reviews/service.ts).
          verifiedBuyer: rand() < 0.6,
          wouldRecommend: rating >= 3 ? true : rand() < 0.2,
          status,
          rejectReason: status === 'rejected' ? pick(REJECT_REASONS) : null,
          helpfulCount: helpful,
          createdAt,
          moderatedAt: status === 'pending' ? null : new Date(createdAt.getTime() + DAY),
        })
        .returning({ id: reviews.id });
      if (!row) throw new Error('review insert returned no row');

      if (status === 'approved') {
        const agg = approvedByProduct.get(pid) ?? { count: 0, sum: 0 };
        approvedByProduct.set(pid, { count: agg.count + 1, sum: agg.sum + rating });
        const image = imageRowsFor(product)[0];
        if (rand() < 0.6 && image && !image.url.endsWith('.svg')) {
          await tx.insert(reviewPhotos).values({ reviewId: row.id, path: image.url, position: 0 });
        }
      }
    }
  }

  // The aggregate is recomputed from the approved reviews for EVERY product (not only the seeded
  // ones), so it is right after a re-seed even when other reviews exist.
  await tx.execute(sql`
    update products set
      rating_count = (select count(*)::int from reviews r
        where r.product_id = products.id and r.status = 'approved'),
      rating_sum = (select coalesce(sum(r.rating), 0)::int from reviews r
        where r.product_id = products.id and r.status = 'approved')
  `);
}
