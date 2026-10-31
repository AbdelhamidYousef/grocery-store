import type { SafetyNotice } from '@store/shared';

import { db } from '../../db/client.ts';
import { notFound } from '../../lib/errors.ts';
import { enqueueEmail, type Outbox } from '../mail/outbox.ts';

import * as repo from './repo.ts';

export function toNotice(row: repo.NoticeRow): SafetyNotice {
  return {
    id: row.id,
    title: row.title,
    bodyMd: row.bodyMd,
    severity: row.severity,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
  };
}

export async function listActiveNotices(): Promise<SafetyNotice[]> {
  return (await repo.listActive()).map(toNotice);
}

// Used by the product detail response.
export async function noticesForVariants(variantIds: string[]): Promise<SafetyNotice[]> {
  return (await repo.listActiveForVariants(variantIds)).map(toNotice);
}

export interface NotifyResult {
  /** Emails queued by this call. */
  queued: number;
  /** Buyers who had already been emailed for this notice, and were skipped. */
  alreadyNotified: number;
}

// Emails everyone who bought an affected variant, once. Deliveries and queued emails are written in
// one transaction: a crash cannot mark someone "notified" without their email being queued, and
// running it again (a double click, a retry) only picks up buyers that are new since last time.
export async function notifyBuyers(
  noticeId: string,
  deps: { outbox: Outbox },
): Promise<NotifyResult> {
  const notice = await repo.findNotice(noticeId);
  if (!notice) throw notFound('Safety notice not found');

  const result = await db.transaction(async (tx) => {
    const buyers = await repo.listBuyerEmails(tx, notice.id);
    const fresh = await repo.claimDeliveries(tx, notice.id, buyers);
    for (const email of fresh) {
      await enqueueEmail(tx, {
        kind: 'safety_notice',
        to: email,
        dedupeKey: `safety_notice:${notice.id}:${email.toLowerCase()}`,
        payload: {
          title: notice.title,
          bodyMd: notice.bodyMd,
          severity: notice.severity,
        },
      });
    }
    return { queued: fresh.length, alreadyNotified: buyers.length - fresh.length };
  });
  deps.outbox.kick();
  return result;
}
