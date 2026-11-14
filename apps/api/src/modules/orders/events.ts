import type { Tx } from '../../db/client.ts';

// A tiny typed in-process registry so features that react to an order changing (trial samples,
// loyalty points, referral rewards, store stock, refund bookkeeping) subscribe here instead of each
// editing the order code. `applyTransition` is the one function that changes an order's status, so
// it is the one place that emits.
//
// Handlers run INSIDE the transition's transaction, one after another in registration order: the
// side effect commits or rolls back together with the status change, and a handler can read the
// order under the row lock the caller already holds. Keep handlers short and database-only; a
// network call must not run under those locks.
//
// Rejected: a queue or database triggers (more moving parts for a single-process demo).

export interface OrderPaidEvent {
  orderId: string;
}
export interface OrderCancelledEvent {
  orderId: string;
}
// One event for every money-back on an order, partial or full. Emitted by `applyTransition` for a
// whole-order refund, and by the returns service for each refunded return. Subscribers (loyalty
// clawback, referral and donation reversal) must be idempotent per `refundId`: the event is
// emitted inside the transaction that records the refund, so it fires exactly once per refund, but
// a subscriber that writes its own rows should key them on `refundId` anyway.
export interface OrderRefundedEvent {
  orderId: string;
  /** Id of the return that was refunded; null for a whole-order refund through a status change. */
  refundId: string | null;
  /** Money returned by THIS refund, integer cents. Never the order total of an earlier refund. */
  amountCents: number;
  /** Same number as `amountCents` (the name phase 14 introduced; kept so existing code reads). */
  refundedCents: number;
  /** The refund's own id, when there is one (phase 22); keys the reversal rows so a retry is a no-op. */
  refundId?: string;
  /** False for a partial refund (only phase 22 emits those). */
  /** True when the order is now fully refunded (its status is `refunded`). */
  full: boolean;
  /** What came back, per order line, so proportional clawbacks can be computed. */
  lines: { orderItemId: string; quantity: number; refundCents: number }[];
  /** Shipping handed back in this refund (0 unless the admin ticked it). */
  shippingCents: number;
}

type Handler<E> = (tx: Tx, event: E) => Promise<void>;

// Sets, not arrays: registering the same function twice (the app is built once per test file, and
// again in hot reload) must not run it twice.
const paid = new Set<Handler<OrderPaidEvent>>();
const cancelled = new Set<Handler<OrderCancelledEvent>>();
const refunded = new Set<Handler<OrderRefundedEvent>>();

export const onOrderPaid = (handler: Handler<OrderPaidEvent>): void => void paid.add(handler);
export const onOrderCancelled = (handler: Handler<OrderCancelledEvent>): void =>
  void cancelled.add(handler);
export const onOrderRefunded = (handler: Handler<OrderRefundedEvent>): void =>
  void refunded.add(handler);

async function run<E>(handlers: Set<Handler<E>>, tx: Tx, event: E): Promise<void> {
  for (const handler of handlers) await handler(tx, event);
}

export const emitOrderPaid = (tx: Tx, e: OrderPaidEvent) => run(paid, tx, e);
export const emitOrderCancelled = (tx: Tx, e: OrderCancelledEvent) => run(cancelled, tx, e);
export const emitOrderRefunded = (tx: Tx, e: OrderRefundedEvent) => run(refunded, tx, e);
