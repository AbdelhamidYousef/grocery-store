import type { OrderStatus } from '@store/shared';

// The whole order lifecycle in one table. Every status change in the API, whoever asks for it (a
// webhook, the sweeper, an admin, the checkout rollback), is checked against it, so "can a
// delivered order be cancelled?" has exactly one answer and it is readable in ten lines.
//
//   pending_payment -> paid | cancelled
//   paid            -> processing | refunded | cancelled
//   processing      -> shipped | cancelled
//   shipped         -> delivered
//   delivered       -> refunded
//   cancelled, refunded: terminal
export const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['processing', 'refunded', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

// Moves nobody may ASK for but that can still HAPPEN: a refund issued in the Stripe dashboard
// while the parcel is being packed or is on its way. The webhook reports a fact we cannot veto, so
// recording it (rather than leaving the order "shipped" with the money gone) is the honest option.
// Admin and customer requests never get these.
export const PROVIDER_ONLY_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: [],
  paid: [],
  processing: ['refunded'],
  shipped: ['refunded'],
  delivered: [],
  cancelled: [],
  refunded: [],
};

export interface TransitionOptions {
  /** True when the change reports something that already happened at the payment provider. */
  fromProvider?: boolean;
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  opts: TransitionOptions = {},
): boolean {
  if (TRANSITIONS[from].includes(to)) return true;
  return opts.fromProvider === true && PROVIDER_ONLY_TRANSITIONS[from].includes(to);
}

// What an admin (or anyone asking) may choose next; the web shows exactly these buttons. `paid` is
// never requestable: money arriving is a fact reported by Stripe (confirmPayment), not a choice.
export function requestableNext(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from].filter((to) => to !== 'paid');
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`An order cannot move from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
  opts: TransitionOptions = {},
): void {
  if (!canTransition(from, to, opts)) throw new InvalidTransitionError(from, to);
}

// What happens to stock when an order leaves `from` for `to`. Pure, so the rules table-tests
// without a database:
//   release - the units were only reserved: give the reservation back;
//   restock - the units had been taken off the shelf but never left the building (not shipped):
//             put them back on the shelf;
//   none    - nothing to do (the goods are with the customer, or never involved stock).
export type StockEffect = 'release' | 'restock' | 'commit' | 'none';

export function stockEffect(from: OrderStatus, to: OrderStatus): StockEffect {
  if (from === 'pending_payment' && to === 'paid') return 'commit';
  if (from === 'pending_payment' && to === 'cancelled') return 'release';
  // Paid and processing orders have been committed (quantity reduced) but not dispatched.
  // Cancelling or refunding one means the parcel never goes out, so the units are sellable again.
  if ((from === 'paid' || from === 'processing') && (to === 'cancelled' || to === 'refunded')) {
    return 'restock';
  }
  // Shipped/delivered then refunded: the goods are out. They come back (if at all) damaged, late
  // and unchecked, so stock is NOT touched automatically; the admin adds returned units through
  // the inventory endpoint after inspecting them.
  return 'none';
}
