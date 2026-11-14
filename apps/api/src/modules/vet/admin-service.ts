import { randomBytes } from 'node:crypto';

import { ErrorCode, type AdminVetApproval } from '@store/shared';
import type { Logger } from 'pino';

import { db, type Tx } from '../../db/client.ts';
import type { VetEmailKind } from '../../emails/vet-update.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import { enqueueEmail } from '../mail/outbox.ts';
import { emitOrderRefunded } from '../orders/events.ts';
import { applyTransition } from '../orders/transition.ts';
import type { ReturnsConfig } from '../returns/config.ts';

import * as repo from './repo.ts';

export interface VetDeps {
  gateway: PaymentGateway;
  log: Logger;
  /** Same simulation rules as return refunds (see returns/config.ts). */
  returns: ReturnsConfig;
}

// A made-up confirmation reference, the only thing the simulated vet "says". Readable, not
// guessable, and clearly fake (VET-SIM prefix).
const confirmationCode = () => `VET-SIM-${randomBytes(4).toString('hex').toUpperCase()}`;

async function toDto(
  row: Awaited<ReturnType<typeof repo.listDecisions>>['rows'][number],
  cfg: ReturnsConfig,
  itemsOf: (orderId: string) => Promise<checkoutRepo.OrderItemRow[]>,
): Promise<AdminVetApproval> {
  const { vet, order } = row;
  return {
    orderNumber: order.number,
    email: order.email,
    orderStatus: order.status,
    totalCents: order.totalCents,
    currency: order.currency,
    placedAt: order.placedAt?.toISOString() ?? null,
    vetName: vet.vetName,
    clinic: vet.clinic,
    vetEmail: vet.vetEmail,
    decision: vet.decision,
    decidedBy: vet.decidedBy,
    decidedAt: vet.decidedAt?.toISOString() ?? null,
    reason: vet.reason,
    confirmationCode: vet.confirmationCode,
    items: (await itemsOf(order.id)).map((i) => ({
      productName: i.productName,
      variantName: i.variantName,
      quantity: i.quantity,
    })),
    simulatedMode: cfg.simulated,
  };
}

export async function list(
  query: { decision: 'pending' | 'approved' | 'rejected'; page: number; limit: number },
  cfg: ReturnsConfig,
) {
  const { rows, total } = await repo.listDecisions(query);
  const data = await Promise.all(
    rows.map((r) => toDto(r, cfg, (orderId) => checkoutRepo.listOrderItems(db, orderId))),
  );
  return {
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function detail(number: string, cfg: ReturnsConfig): Promise<AdminVetApproval> {
  const order = await checkoutRepo.findOrderByNumber(number);
  const vet = order && (await repo.findVetDetails(db, order.id));
  if (!order || !vet) throw notFound('No vet approval for that order');
  return toDto({ vet, order }, cfg, (id) => checkoutRepo.listOrderItems(db, id));
}

const firstName = (order: checkoutRepo.OrderRow) =>
  order.shippingAddress.fullName.trim().split(/\s+/)[0] || 'there';

export async function queueVetEmail(
  tx: Tx,
  kind: VetEmailKind,
  order: checkoutRepo.OrderRow,
  extra: { reason?: string | null; simulated?: boolean } = {},
): Promise<void> {
  await enqueueEmail(tx, {
    kind,
    to: order.email,
    orderId: order.id,
    payload: { firstName: firstName(order), orderNumber: order.number, ...extra },
    dedupeKey: `${kind}:${order.id}`,
  });
}

const notWaiting = (status: string) =>
  conflict(ErrorCode.CONFLICT, `This order is ${status}, not waiting for a vet`, { status });

// Simulated vet confirmation: no email and no call to any vet. The decision, who made it and a
// fake confirmation code are recorded, and the order moves on to packing.
export async function approve(deps: VetDeps, number: string, actor: string) {
  const seen = await checkoutRepo.findOrderByNumber(number);
  if (!seen || !(await repo.findVetDetails(db, seen.id))) throw notFound('Order not found');
  const code = confirmationCode();
  await db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, seen.id);
    if (!order) throw notFound('Order not found');
    if (order.status !== 'awaiting_vet_approval') throw notWaiting(order.status);
    await repo.lockVetDetails(tx, order.id);
    await repo.decide(tx, order.id, {
      decision: 'approved',
      decidedBy: actor,
      decidedAt: new Date(),
      reason: null,
      confirmationCode: code,
    });
    await applyTransition(tx, order, 'processing', {
      actor,
      note: `Vet approval (simulated), confirmation ${code}`,
    });
    await queueVetEmail(tx, 'vet_approved', order);
  });
  deps.log.info({ orderNumber: number, actor, confirmationCode: code }, 'vet approval (simulated)');
  return detail(number, deps.returns);
}

// Rejection undoes the sale: full refund (gateway first, outside any transaction, key
// `refund:<orderId>` like every whole-order refund, so a retry is safe), then one transaction
// that cancels the order (stock goes back, `onOrderCancelled` fires), records the decision and
// emits the full-refund event. In demo mode (no gateway) the refund is simulated and labelled.
export async function reject(deps: VetDeps, number: string, actor: string, reason: string) {
  const seen = await checkoutRepo.findOrderByNumber(number);
  if (!seen || !(await repo.findVetDetails(db, seen.id))) throw notFound('Order not found');
  if (seen.status === 'cancelled') return detail(number, deps.returns); // already done: idempotent
  if (seen.status !== 'awaiting_vet_approval') throw notWaiting(seen.status);

  const simulated = deps.returns.simulated;
  if (!simulated) {
    const payment = await checkoutRepo.findPaymentByOrder(db, seen.id);
    if (!payment?.providerPaymentIntentId) {
      throw conflict(ErrorCode.CONFLICT, 'This order has no payment to refund');
    }
    await deps.gateway.refundPaymentIntent(payment.providerPaymentIntentId, `refund:${seen.id}`);
  }

  await db.transaction(async (tx) => {
    const order = await checkoutRepo.lockOrder(tx, seen.id);
    if (!order) throw notFound('Order not found');
    if (order.status === 'cancelled') return;
    if (order.status !== 'awaiting_vet_approval') throw notWaiting(order.status);
    await repo.lockVetDetails(tx, order.id);
    await repo.decide(tx, order.id, {
      decision: 'rejected',
      decidedBy: actor,
      decidedAt: new Date(),
      reason,
      confirmationCode: null,
    });
    await applyTransition(tx, order, 'cancelled', {
      actor,
      note: `Vet approval rejected: ${reason}${simulated ? ' (refund simulated)' : ''}`,
    });
    const lines = await checkoutRepo.listOrderItems(tx, order.id);
    await emitOrderRefunded(tx, {
      orderId: order.id,
      refundId: `vet-rejection:${order.id}`,
      amountCents: order.totalCents,
      refundedCents: order.totalCents,
      full: true,
      lines: lines.map((l) => ({
        orderItemId: l.id,
        quantity: l.quantity,
        refundCents: l.lineTotalCents - l.discountCents,
      })),
      shippingCents: order.shippingCents,
    });
    await queueVetEmail(tx, 'vet_rejected', order, { reason, simulated });
  });
  deps.log.info({ orderNumber: number, actor, simulated }, 'vet approval rejected');
  return detail(number, deps.returns);
}

export { detail as getDetail };
