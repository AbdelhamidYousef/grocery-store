import { randomInt } from 'node:crypto';

import { STORES } from '@store/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import type { db, Tx } from '../../db/client.ts';
import { discountCodes, discountRedemptions } from '../../db/schema/index.ts';

type Run = typeof db | Tx;

// No 0/O or 1/I/L: a code is read out of an email and typed into a box.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const group = (n: number) =>
  Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PersonalCodeSpec {
  /** The only account that may use the code; omit for a code anyone holding it may use once. */
  userId?: string;
  kind: 'fixed' | 'free_shipping' | 'percent';
  /** Cents for `fixed`, whole percent for `percent`; ignored for `free_shipping`. */
  valueCents: number;
  /** Only valid on a customer's first order (the newsletter welcome code). */
  firstOrderOnly?: boolean;
  /** 1 gives `PREFIX-XXXX`, 2 (default) gives `PREFIX-XXXX-XXXX`. */
  groups?: 1 | 2;
  minSpendCents?: number;
  expiresInDays: number;
  /** "PAWS", "REF" ... */
  prefix: string;
  now?: Date;
}

// A personal code is a phase 18 `discount_codes` row that only its owner can use, once, until it
// expires: the engine and checkout enforce all three (owner in `promotions.price`, `max_uses` 1 in
// the usage counter, the window in the engine). Loyalty adds no discount path of its own.
// Rewards, referrals and welcome codes are worth the SAME number of minor units in every currency
// the shop sells in (1 point = 1 minor unit of whichever currency it is spent in, EUR 5.00 off is
// GBP 5.00 off), so the by-currency maps are the base figures repeated. A different exchange would
// be a decision about money; this keeps the rule one line long and visible (decisions log 21.9).
const OTHER_CURRENCIES = [...new Set(STORES.map((s) => s.currency))].filter((c) => c !== 'EUR');
const sameIn = (cents: number): Record<string, number> =>
  Object.fromEntries(OTHER_CURRENCIES.map((c) => [c, cents]));

export async function mintPersonalCode(run: Run, spec: PersonalCodeSpec) {
  const now = spec.now ?? new Date();
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await run
      .insert(discountCodes)
      .values({
        code:
          spec.groups === 1
            ? `${spec.prefix}-${group(4)}`
            : `${spec.prefix}-${group(4)}-${group(4)}`,
        kind: spec.kind,
        value: spec.kind === 'free_shipping' ? 0 : spec.valueCents,
        firstOrderOnly: spec.firstOrderOnly ?? false,
        minSpendCents: spec.minSpendCents ?? 0,
        valueByCurrency: spec.kind === 'fixed' ? sameIn(spec.valueCents) : {},
        minSpendByCurrency: spec.minSpendCents ? sameIn(spec.minSpendCents) : {},
        maxUses: 1,
        ownerUserId: spec.userId ?? null,
        startsAt: now,
        endsAt: new Date(now.getTime() + spec.expiresInDays * DAY_MS),
      })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
  }
  throw new Error('could not mint a unique personal code');
}

// The owner's codes, newest first, with whether each one has been used (a live redemption row).
export async function listPersonalCodes(run: Run, userId: string) {
  return run
    .select({
      code: discountCodes.code,
      kind: discountCodes.kind,
      value: discountCodes.value,
      minSpendCents: discountCodes.minSpendCents,
      endsAt: discountCodes.endsAt,
      createdAt: discountCodes.createdAt,
      active: discountCodes.active,
      used: sql<boolean>`exists (select 1 from ${discountRedemptions} where ${discountRedemptions.codeId} = ${discountCodes.id} and ${discountRedemptions.releasedAt} is null)`,
    })
    .from(discountCodes)
    .where(and(eq(discountCodes.ownerUserId, userId), isNull(discountCodes.archivedAt)))
    .orderBy(desc(discountCodes.createdAt));
}
