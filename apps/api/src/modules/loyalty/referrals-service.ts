import { createHash, randomInt } from 'node:crypto';

import {
  normalizeEmail,
  REFERRAL_CODE_DAYS,
  REFERRAL_MAX_PER_YEAR,
  REFERRAL_MIN_ORDER_CENTS,
  REFERRAL_REWARD_CENTS,
  type ReferralSummary,
} from '@store/shared';
import { and, count, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import {
  addresses,
  discountCodes,
  discountRedemptions,
  orders,
  referralCodes,
  referrals,
  users,
} from '../../db/schema/index.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import {
  onOrderCancelled,
  onOrderPaid,
  onOrderRefunded,
  type OrderCancelledEvent,
  type OrderPaidEvent,
  type OrderRefundedEvent,
} from '../orders/events.ts';

import { mintPersonalCode } from './codes.ts';

type Run = typeof db | Tx;

// "Paid or later": the statuses that mean money was taken.
const PAID_STATUSES = ['paid', 'processing', 'shipped', 'delivered', 'refunded'] as const;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomCode = () =>
  `PAW${Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

// What a code in the cookie or URL may look like: letters, digits and dashes, short.
export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9-]{4,24}$/;

export const addressHash = (a: { line1: string; postalCode: string; country: string }): string =>
  createHash('sha256')
    .update(
      [a.line1, a.postalCode, a.country]
        .map((v) => v.toLowerCase().replace(/[^a-z0-9]/g, ''))
        .join('|'),
    )
    .digest('hex');

// ---------- the shareable code ----------

export async function getOrCreateCode(run: Run, userId: string): Promise<string> {
  const [existing] = await run
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.userId, userId));
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await run
      .insert(referralCodes)
      .values({ userId, code: randomCode() })
      .onConflictDoNothing()
      .returning({ code: referralCodes.code });
    if (row) return row.code;
    // Lost a race for the same user (or the same random code): read what is there.
    const [again] = await run
      .select({ code: referralCodes.code })
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId));
    if (again) return again.code;
  }
  throw new Error('could not create a referral code');
}

export async function getSummary(userId: string): Promise<ReferralSummary> {
  const code = await getOrCreateCode(db, userId);
  const rows = await db
    .select({ status: referrals.status, n: count() })
    .from(referrals)
    .where(eq(referrals.referrerId, userId))
    .groupBy(referrals.status);
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return {
    code,
    rewardCents: REFERRAL_REWARD_CENTS,
    minOrderCents: REFERRAL_MIN_ORDER_CENTS,
    codeDays: REFERRAL_CODE_DAYS,
    maxPerYear: REFERRAL_MAX_PER_YEAR,
    pending: n('pending'),
    qualified: n('qualified'),
    rejected: n('rejected'),
  };
}

// ---------- attaching at registration ----------

// Called right after an account is created, with the code the visitor arrived with. It never
// throws into registration (the caller wraps it): a bad or unknown code simply does nothing.
export async function attachOnRegister(
  newUser: { id: string; email: string },
  rawCode: string,
): Promise<'pending' | 'rejected' | 'ignored'> {
  if (!REFERRAL_CODE_PATTERN.test(rawCode)) return 'ignored';
  const [owner] = await db
    .select({ userId: referralCodes.userId, email: users.email })
    .from(referralCodes)
    .innerJoin(users, eq(users.id, referralCodes.userId))
    .where(eq(referralCodes.code, rawCode.toUpperCase()));
  if (!owner || owner.userId === newUser.id) return 'ignored';

  let rejectReason: string | null = null;
  // The same mailbox in disguise (a+1@x.com, a.b@gmail.com): not a friend, a second account.
  if (normalizeEmail(owner.email) === normalizeEmail(newUser.email)) {
    rejectReason = 'self_referral';
  } else {
    // "New customer": nobody who has already paid us (as a guest) with this address.
    const [prior] = await db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.email, newUser.email), inArray(orders.status, [...PAID_STATUSES])));
    if ((prior?.n ?? 0) > 0) rejectReason = 'not_a_new_customer';
  }

  const inserted = await db
    .insert(referrals)
    .values({
      referrerId: owner.userId,
      referredUserId: newUser.id,
      status: rejectReason ? 'rejected' : 'pending',
      rejectReason,
    })
    .onConflictDoNothing({ target: referrals.referredUserId })
    .returning({ status: referrals.status });
  if (inserted.length === 0) return 'ignored';
  return rejectReason ? 'rejected' : 'pending';
}

// ---------- qualifying on the first real order ----------

async function referrerShippingHashes(run: Run, referrerId: string): Promise<Set<string>> {
  const hashes = new Set<string>();
  const placed = await run
    .select({ address: orders.shippingAddress })
    .from(orders)
    .where(and(eq(orders.userId, referrerId), ne(orders.status, 'cancelled')))
    .orderBy(desc(orders.createdAt))
    .limit(50);
  for (const o of placed) hashes.add(addressHash(o.address));
  const saved = await run
    .select({
      line1: addresses.line1,
      postalCode: addresses.postalCode,
      country: addresses.country,
    })
    .from(addresses)
    .where(eq(addresses.userId, referrerId));
  for (const a of saved) hashes.add(addressHash(a));
  return hashes;
}

async function qualifyOnPaid(tx: Tx, { orderId }: OrderPaidEvent): Promise<void> {
  const order = await checkoutRepo.findOrderById(tx, orderId);
  if (!order?.userId) return;
  // Lock the row: two paid events for the same customer cannot both qualify it.
  const [referral] = await tx
    .select()
    .from(referrals)
    .where(and(eq(referrals.referredUserId, order.userId), eq(referrals.status, 'pending')))
    .for('update');
  if (!referral) return;

  // Only a real order counts: paid merchandise of at least EUR 20 after discounts. A smaller
  // first order leaves the referral pending for a later one.
  if (order.subtotalCents - order.discountCents < REFERRAL_MIN_ORDER_CENTS) return;

  const reject = async (reason: string) => {
    await tx
      .update(referrals)
      .set({ status: 'rejected', rejectReason: reason })
      .where(eq(referrals.id, referral.id));
  };

  // Same delivery address as the referrer: a household, not a friend.
  const mine = addressHash(order.shippingAddress);
  if ((await referrerShippingHashes(tx, referral.referrerId)).has(mine)) {
    await reject('same_address');
    return;
  }
  // A referrer can bring in at most 10 people a year (rolling 365 days). Two friends of one
  // referrer paying at the same moment each hold their OWN referral row lock, so count under the
  // referrer's user-row lock or both could see 9 and both qualify.
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, referral.referrerId))
    .for('update');
  const [done] = await tx
    .select({ n: count() })
    .from(referrals)
    .where(
      and(
        eq(referrals.referrerId, referral.referrerId),
        eq(referrals.status, 'qualified'),
        gte(referrals.qualifiedAt, new Date(Date.now() - YEAR_MS)),
      ),
    );
  if ((done?.n ?? 0) >= REFERRAL_MAX_PER_YEAR) {
    await reject('referrer_limit');
    return;
  }

  const spec = {
    kind: 'fixed' as const,
    valueCents: REFERRAL_REWARD_CENTS,
    minSpendCents: REFERRAL_MIN_ORDER_CENTS,
    expiresInDays: REFERRAL_CODE_DAYS,
    prefix: 'FRIEND',
  };
  const referrerCode = await mintPersonalCode(tx, { ...spec, userId: referral.referrerId });
  const refereeCode = await mintPersonalCode(tx, { ...spec, userId: order.userId });
  await tx
    .update(referrals)
    .set({
      status: 'qualified',
      qualifiedOrderId: orderId,
      referrerCodeId: referrerCode.id,
      refereeCodeId: refereeCode.id,
      qualifiedAt: new Date(),
    })
    .where(eq(referrals.id, referral.id));
}

// ---------- voiding on refund ----------

// A cancelled or fully refunded qualifying order takes back what it unlocked: the two codes are
// switched off, unless one has already been used (the discount was given; nothing to take back).
async function voidFor(tx: Tx, orderId: string): Promise<void> {
  const [referral] = await tx
    .select()
    .from(referrals)
    .where(
      and(
        eq(referrals.qualifiedOrderId, orderId),
        eq(referrals.status, 'qualified'),
        isNull(referrals.voidedAt),
      ),
    )
    .for('update');
  if (!referral) return;
  const ids = [referral.referrerCodeId, referral.refereeCodeId].flatMap((c) => (c ? [c] : []));
  if (ids.length > 0) {
    await tx
      .update(discountCodes)
      .set({ active: false })
      .where(
        and(
          inArray(discountCodes.id, ids),
          // Skip only a code already spent on an order that was PAID: a redemption held by an
          // unpaid pending_payment order is released by the sweeper later, and a code left
          // active would revive.
          sql`not exists (select 1 from ${discountRedemptions} join ${orders} on ${orders.id} = ${discountRedemptions.orderId} where ${discountRedemptions.codeId} = ${discountCodes.id} and ${discountRedemptions.releasedAt} is null and ${orders.status} in ('paid', 'processing', 'shipped', 'delivered'))`,
        ),
      );
  }
  await tx.update(referrals).set({ voidedAt: new Date() }).where(eq(referrals.id, referral.id));
}

const onCancelled = (tx: Tx, e: OrderCancelledEvent) => voidFor(tx, e.orderId);
const onRefunded = async (tx: Tx, e: OrderRefundedEvent) => {
  if (e.full) await voidFor(tx, e.orderId);
};

export function registerReferralSubscribers(): void {
  onOrderPaid(qualifyOnPaid);
  onOrderCancelled(onCancelled);
  onOrderRefunded(onRefunded);
}
