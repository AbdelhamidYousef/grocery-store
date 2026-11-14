import { createHash, randomBytes } from 'node:crypto';

import {
  NEWSLETTER_CONFIRM_HOURS,
  NEWSLETTER_CONSENT_TEXT,
  WELCOME_CODE_DAYS,
  WELCOME_CODE_PERCENT,
  type NewsletterSubscribeInput,
} from '@store/shared';
import { and, eq } from 'drizzle-orm';

import { env } from '../../config/env.ts';
import { db, type Tx } from '../../db/client.ts';
import { newsletterSubscribers } from '../../db/schema/index.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { currentStore } from '../i18n/context.ts';
import { mintPersonalCode } from '../loyalty/codes.ts';
import { enqueueEmail, type Outbox } from '../mail/outbox.ts';

const HOUR_MS = 60 * 60 * 1000;

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
const newToken = (): string => randomBytes(24).toString('base64url');

const origin = (): string => env.WEB_ORIGIN.replace(/\/$/, '');
export const confirmUrl = (token: string): string =>
  `${origin()}/newsletter/confirm?token=${encodeURIComponent(token)}`;
export const unsubscribeUrl = (token: string): string =>
  `${origin()}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;

// Subscribe is deliberately the same for every address. A new address and a pending one get a
// (fresh) confirmation link, an unsubscribed one starts over, and a confirmed one gets nothing:
// the caller cannot tell which case it hit, so the form cannot be used to probe who is on the list.
export async function subscribe(
  input: NewsletterSubscribeInput & { userId?: string | null },
  deps: { outbox: Outbox; now?: Date },
): Promise<void> {
  if (input.website) return; // honeypot: look like success, store and send nothing
  const now = deps.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  const pets = [...new Set(input.pets ?? [])];

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, email))
      .for('update');
    if (existing?.status === 'confirmed') return;

    const token = newToken();
    const fields = {
      status: 'pending' as const,
      tokenHash: hashToken(token),
      tokenExpiresAt: new Date(now.getTime() + NEWSLETTER_CONFIRM_HOURS * HOUR_MS),
      pets,
      consentText: NEWSLETTER_CONSENT_TEXT,
      storeView: currentStore().code,
      ...(input.userId && { userId: input.userId }),
    };
    let unsubscribeToken: string;
    if (existing) {
      await tx
        .update(newsletterSubscribers)
        .set(fields)
        .where(eq(newsletterSubscribers.id, existing.id));
      unsubscribeToken = existing.unsubscribeToken;
    } else {
      unsubscribeToken = newToken();
      const [row] = await tx
        .insert(newsletterSubscribers)
        .values({ email, unsubscribeToken, ...fields })
        .onConflictDoNothing()
        .returning({ id: newsletterSubscribers.id });
      if (!row) return; // a concurrent request made the row first; its mail is on the way
    }
    await enqueueEmail(tx, {
      kind: 'newsletter_confirm',
      to: email,
      storeView: currentStore().code,
      dedupeKey: `newsletter_confirm:${hashToken(token).slice(0, 16)}`,
      payload: {
        confirmUrl: confirmUrl(token),
        unsubscribeUrl: unsubscribeUrl(unsubscribeToken),
        hours: NEWSLETTER_CONFIRM_HOURS,
      },
    });
  });
  deps.outbox.kick();
}

export type ConfirmStatus = 'confirmed' | 'already_confirmed';

// The click in the inbox. Unknown and expired links both fail (410 for an expired one, so the page
// can offer a fresh link); a link used twice is a harmless "already confirmed".
export async function confirm(
  token: string,
  deps: { outbox: Outbox; now?: Date },
): Promise<ConfirmStatus> {
  const now = deps.now ?? new Date();
  const status = await db.transaction(async (tx): Promise<ConfirmStatus> => {
    const [row] = await tx
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.tokenHash, hashToken(token)))
      .for('update');
    if (!row) throw notFound('This confirmation link is not valid');
    if (row.status === 'confirmed') return 'already_confirmed';
    if (row.status === 'unsubscribed') throw notFound('This confirmation link is not valid');
    if (!row.tokenExpiresAt || row.tokenExpiresAt <= now) {
      throw new AppError('NOT_FOUND', 'This confirmation link has expired', { expired: true }, 410);
    }

    let codeId = row.welcomeCodeId;
    let code: string | null = null;
    if (!codeId) {
      const minted = await mintPersonalCode(tx, {
        kind: 'percent',
        valueCents: WELCOME_CODE_PERCENT,
        firstOrderOnly: true,
        expiresInDays: WELCOME_CODE_DAYS,
        prefix: 'WELCOME',
        groups: 1,
        now,
      });
      codeId = minted.id;
      code = minted.code;
    }
    await tx
      .update(newsletterSubscribers)
      .set({ status: 'confirmed', confirmedAt: now, welcomeCodeId: codeId })
      .where(eq(newsletterSubscribers.id, row.id));
    if (code) {
      await enqueueEmail(tx, {
        kind: 'newsletter_welcome',
        to: row.email,
        storeView: row.storeView,
        dedupeKey: `newsletter_welcome:${row.id}`,
        payload: {
          code,
          percent: WELCOME_CODE_PERCENT,
          days: WELCOME_CODE_DAYS,
          unsubscribeUrl: unsubscribeUrl(row.unsubscribeToken),
        },
      });
    }
    return 'confirmed';
  });
  deps.outbox.kick();
  return status;
}

export async function unsubscribe(token: string, now = new Date()): Promise<void> {
  const [row] = await db
    .update(newsletterSubscribers)
    .set({ status: 'unsubscribed', unsubscribedAt: now, tokenHash: null, tokenExpiresAt: null })
    .where(eq(newsletterSubscribers.unsubscribeToken, token))
    .returning({ id: newsletterSubscribers.id });
  if (!row) throw notFound('This unsubscribe link is not valid');
}

/** A subscriber who may be sent marketing mail (pet interests): confirmed and not unsubscribed. */
export async function findConfirmedByEmail(run: typeof db | Tx, email: string) {
  const [row] = await run
    .select()
    .from(newsletterSubscribers)
    .where(
      and(eq(newsletterSubscribers.email, email), eq(newsletterSubscribers.status, 'confirmed')),
    );
  return row ?? null;
}
