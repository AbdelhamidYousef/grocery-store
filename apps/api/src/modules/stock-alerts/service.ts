import { randomBytes } from 'node:crypto';

import { STOCK_ALERT_MAX_WAITING } from '@store/shared';
import { and, count, eq, isNotNull, sql } from 'drizzle-orm';
import type { Logger } from 'pino';

import { env } from '../../config/env.ts';
import { stockQuantity, stockReserved } from '../../db/available.ts';
import { db } from '../../db/client.ts';
import { inventory, productVariants, products, stockAlerts } from '../../db/schema/index.ts';
import { storeFor } from '../../emails/i18n/index.ts';
import { conflict, notFound, validation } from '../../lib/errors.ts';
import { currentStore } from '../i18n/context.ts';
import { enqueueEmail, type Outbox } from '../mail/outbox.ts';

const origin = (): string => env.WEB_ORIGIN.replace(/\/$/, '');
export const cancelUrl = (token: string): string =>
  `${origin()}/stock-alerts/cancel?token=${encodeURIComponent(token)}`;

const availableOf = sql<number>`coalesce(${stockQuantity(productVariants.id)} - ${stockReserved(productVariants.id)}, 0)`;

// Asking for an alert on something that is in stock is a mistake worth saying out loud. Asking
// twice for the same variant is the same ask (idempotent), and one address can wait on at most 5
// variants so the table cannot be filled by a script.
export async function createAlert(input: {
  variantId: string;
  email: string;
  userId: string | null;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  await db.transaction(async (tx) => {
    const [v] = await tx
      .select({ available: availableOf, status: productVariants.status, product: products.status })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.id, input.variantId));
    if (!v || v.status !== 'active' || v.product !== 'active') throw notFound('Variant not found');
    if (v.available > 0) throw conflict('CONFLICT', 'This item is in stock right now');

    // Serialise one address's inserts so two parallel requests cannot both pass the limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'stock-alert:' + email}))`);
    const [dup] = await tx
      .select({ id: stockAlerts.id })
      .from(stockAlerts)
      .where(
        and(
          eq(stockAlerts.variantId, input.variantId),
          eq(stockAlerts.email, email),
          eq(stockAlerts.status, 'waiting'),
        ),
      );
    if (dup) return;
    const [waiting] = await tx
      .select({ n: count() })
      .from(stockAlerts)
      .where(and(eq(stockAlerts.email, email), eq(stockAlerts.status, 'waiting')));
    if ((waiting?.n ?? 0) >= STOCK_ALERT_MAX_WAITING) {
      throw validation(
        { email: `You can wait for at most ${STOCK_ALERT_MAX_WAITING} items at a time` },
        'Too many alerts',
      );
    }
    await tx.insert(stockAlerts).values({
      variantId: input.variantId,
      email,
      userId: input.userId,
      token: randomBytes(24).toString('base64url'),
      storeView: currentStore().code,
    });
  });
}

export async function cancelAlert(token: string): Promise<void> {
  const [row] = await db
    .update(stockAlerts)
    .set({ status: 'cancelled' })
    .where(and(eq(stockAlerts.token, token), eq(stockAlerts.status, 'waiting')))
    .returning({ id: stockAlerts.id });
  if (!row) {
    // Already cancelled or sent counts as done; only an unknown token is a 404.
    const [any] = await db
      .select({ id: stockAlerts.id })
      .from(stockAlerts)
      .where(eq(stockAlerts.token, token));
    if (!any) throw notFound('This link is not valid');
  }
}

export interface SendResult {
  sent: number;
  /** Due but sold out again before we got to it: waiting for the next restock. */
  deferred: number;
}

// The hourly job. The trigger on `inventory` set `due_at`; here each due alert is re-checked
// against the stock NOW (it may have sold out again), queued through the outbox in the same
// transaction that marks it sent (so it is neither lost nor sent twice), and the mail kicked.
export async function sendDueAlerts(deps: {
  outbox?: Outbox | undefined;
  log: Logger;
}): Promise<SendResult> {
  const result: SendResult = { sent: 0, deferred: 0 };
  await db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: stockAlerts.id,
        email: stockAlerts.email,
        token: stockAlerts.token,
        storeView: stockAlerts.storeView,
        available: availableOf,
        productName: products.name,
        productSlug: products.slug,
        variantName: productVariants.name,
        sku: productVariants.sku,
        variantStatus: productVariants.status,
        productStatus: products.status,
      })
      .from(stockAlerts)
      .innerJoin(productVariants, eq(productVariants.id, stockAlerts.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(stockAlerts.status, 'waiting'), isNotNull(stockAlerts.dueAt)))
      .for('update', { of: stockAlerts, skipLocked: true });

    for (const a of due) {
      if (a.available <= 0 || a.variantStatus !== 'active' || a.productStatus !== 'active') {
        await tx.update(stockAlerts).set({ dueAt: null }).where(eq(stockAlerts.id, a.id));
        result.deferred += 1;
        continue;
      }
      await enqueueEmail(tx, {
        kind: 'stock_alert',
        to: a.email,
        storeView: a.storeView,
        dedupeKey: `stock_alert:${a.id}`,
        payload: {
          productName: a.productName,
          variantName: a.variantName,
          productUrl: `${origin()}/${storeFor(a.storeView).code}/products/${a.productSlug}?variant=${encodeURIComponent(a.sku)}`,
          cancelUrl: cancelUrl(a.token),
        },
      });
      await tx
        .update(stockAlerts)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(stockAlerts.id, a.id));
      result.sent += 1;
    }
  });
  if (result.sent > 0) deps.outbox?.kick();
  return result;
}
