import type { AdminSafetyInputSchema, AdminSafetyNotice, SafetyNotice } from '@store/shared';
import type { z } from 'zod';

import { db } from '../../db/client.ts';
import { notFound, validation } from '../../lib/errors.ts';
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
    const storeOf = new Map(buyers.map((b) => [b.email, b.storeView]));
    const fresh = await repo.claimDeliveries(
      tx,
      notice.id,
      buyers.map((b) => b.email),
    );
    for (const email of fresh) {
      await enqueueEmail(tx, {
        kind: 'safety_notice',
        to: email,
        storeView: storeOf.get(email),
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

// ---------- admin ----------

type SafetyInput = z.output<typeof AdminSafetyInputSchema>;

const isActive = (n: repo.NoticeRow, now = Date.now()): boolean =>
  n.status === 'published' &&
  n.startsAt.getTime() <= now &&
  (n.endsAt === null || n.endsAt.getTime() > now);

async function toAdmin(row: repo.AdminNoticeRow): Promise<AdminSafetyNotice> {
  return {
    id: row.id,
    title: row.title,
    bodyMd: row.bodyMd,
    severity: row.severity,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    status: row.status,
    isActive: isActive(row),
    deliveryCount: row.deliveryCount,
    variants: await repo.listNoticeVariants(row.id),
  };
}

export async function listAdminNotices(): Promise<AdminSafetyNotice[]> {
  return Promise.all((await repo.listAll()).map(toAdmin));
}

export async function getAdminNotice(id: string): Promise<AdminSafetyNotice> {
  const row = await repo.findAdminNotice(id);
  if (!row) throw notFound('Safety notice not found');
  return toAdmin(row);
}

async function saveNotice(id: string | null, input: SafetyInput): Promise<string> {
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (endsAt && endsAt <= startsAt) {
    throw validation({
      formErrors: [],
      fieldErrors: { endsAt: ['The end must be after the start'] },
    });
  }
  return db.transaction(async (tx) => {
    const variantIds = [...new Set(input.variantIds)];
    if ((await repo.countVariants(tx, variantIds)) !== variantIds.length) {
      throw validation({
        formErrors: [],
        fieldErrors: { variantIds: ['One of the chosen variants no longer exists'] },
      });
    }
    const values = {
      title: input.title,
      bodyMd: input.bodyMd,
      severity: input.severity,
      startsAt,
      endsAt,
      status: input.status,
    };
    const noticeId = id ?? (await repo.insertNotice(tx, values));
    if (id && !(await repo.updateNotice(tx, id, values))) throw notFound('Safety notice not found');
    await repo.replaceVariants(tx, noticeId, variantIds);
    return noticeId;
  });
}

export async function createNotice(input: SafetyInput): Promise<AdminSafetyNotice> {
  return getAdminNotice(await saveNotice(null, input));
}

export async function updateNotice(id: string, input: SafetyInput): Promise<AdminSafetyNotice> {
  return getAdminNotice(await saveNotice(id, input));
}

export async function deleteNotice(id: string): Promise<void> {
  if (!(await repo.deleteNotice(id))) throw notFound('Safety notice not found');
}
