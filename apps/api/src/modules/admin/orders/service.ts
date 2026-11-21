import {
  ErrorCode,
  type AdminCustomerRow,
  type AdminOrderDetail,
  type AdminOrderRow,
  type OrderStatus,
} from '@store/shared';
import type { Logger } from 'pino';

import { db } from '../../../db/client.ts';
import { conflict, notFound } from '../../../lib/errors.ts';
import type { PaymentGateway } from '../../../lib/stripe.ts';
import { finalizeOrder, type Weighing } from '../../checkout/capture.ts';
import * as checkoutRepo from '../../checkout/repo.ts';
import { transitionOrder } from '../../orders/service.ts';
import { requestableNext } from '../../orders/state-machine.ts';
import { toOrderDto } from '../../orders/view.ts';
import { listOrderPromotions } from '../../promotions/repo.ts';

import * as repo from './repo.ts';

const page = (p: number, limit: number, total: number) => ({
  page: p,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

export async function listOrders(query: {
  status?: OrderStatus | undefined;
  q?: string | undefined;
  page: number;
  limit: number;
}) {
  const { rows, total } = await repo.listOrders(query);
  const data: AdminOrderRow[] = rows.map((r) => ({
    number: r.number,
    status: r.status,
    email: r.email,
    totalCents: r.totalCents,
    currency: r.currency,
    itemCount: Number(r.itemCount ?? 0),
    paymentStatus: r.paymentStatus,
    placedAt: r.placedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
  return { data, meta: page(query.page, query.limit, total) };
}

export async function capture(
  deps: { gateway: PaymentGateway; log: Logger },
  number: string,
  actor: string,
  weights?: Weighing[],
): Promise<AdminOrderDetail> {
  const order = await checkoutRepo.findOrderByNumber(number);
  if (!order) throw notFound('Order not found');
  await finalizeOrder(deps, order.id, { actor, ...(weights && { weights }) });
  return getOrderDetail(number);
}

export async function getOrderDetail(number: string): Promise<AdminOrderDetail> {
  const order = await checkoutRepo.findOrderByNumber(number);
  if (!order) throw notFound('Order not found');
  const [items, payment, history, customer, promotions] = await Promise.all([
    checkoutRepo.listOrderItems(db, order.id),
    checkoutRepo.findPaymentByOrder(db, order.id),
    repo.listHistory(order.id),
    order.userId ? repo.findCustomer(order.userId) : undefined,
    listOrderPromotions(db, order.id),
  ]);
  return {
    order: toOrderDto(order, items, payment),
    payment: payment
      ? {
          status: payment.status,
          providerPaymentIntentId: payment.providerPaymentIntentId,
          amountCents: payment.amountCents,
          currency: payment.currency,
          lastError: payment.lastError,
        }
      : null,
    customer: customer
      ? {
          id: customer.id,
          email: customer.email,
          name: `${customer.firstName} ${customer.lastName}`.trim(),
        }
      : null,
    history: history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      actor: h.actor,
      note: h.note,
      at: h.createdAt.toISOString(),
    })),
    promotions: promotions.map((p) => ({ type: p.type, label: p.label, cents: p.cents })),
    // A card that is only authorised ships through the packer view (pack, capture, hand to the rider):
    // "shipped" by hand would skip the capture, so the button is not offered (the transition refuses it too).
    allowedNext: requestableNext(order.status).filter(
      (to) => !(to === 'shipped' && order.authorizedCents !== null),
    ),
  };
}

// The admin's status button. Everything that matters (validation, stock, Stripe refund, history,
// email) is in `transitionOrder` and the state machine; this layer only adds who is acting.
export async function transition(
  deps: { gateway: PaymentGateway; log: Logger },
  number: string,
  to: OrderStatus,
  actor: string,
  note: string | undefined,
): Promise<AdminOrderDetail> {
  // A card that is only authorised is charged at dispatch, from the packed grams. "Mark shipped"
  // would skip the packing and the capture, so it stays only for orders charged in full at checkout.
  if (to === 'shipped') {
    const order = await checkoutRepo.findOrderByNumber(number);
    const payment = order ? await checkoutRepo.findPaymentByOrder(db, order.id) : null;
    if (payment?.captureMethod === 'manual') {
      throw conflict(
        ErrorCode.CONFLICT,
        'Pack the bag and hand it to the rider in the packer view: that charges the card and ships the order',
        { from: order?.status, to, via: 'picking' },
      );
    }
  }
  await transitionOrder(deps, number, to, { actor, note: note ?? null });
  return getOrderDetail(number);
}

export async function listCustomers(query: {
  q?: string | undefined;
  page: number;
  limit: number;
}) {
  const { rows, total } = await repo.listCustomers(query);
  const data: AdminCustomerRow[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    orderCount: r.orderCount ?? 0,
    lastOrderAt: r.lastOrderAt ? new Date(r.lastOrderAt).toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
  return { data, meta: page(query.page, query.limit, total) };
}
