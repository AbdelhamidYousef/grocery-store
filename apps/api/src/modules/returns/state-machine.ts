import type { ReturnStatus } from '@store/shared';

// The whole return lifecycle in one table, same idea as the order state machine: every change goes
// through `assertReturnTransition`, so "can a rejected return be refunded?" has one answer.
//
//   requested -> approved | rejected
//   approved  -> received
//   received  -> refunded
//   rejected, refunded: terminal
export const RETURN_TRANSITIONS: Readonly<Record<ReturnStatus, readonly ReturnStatus[]>> = {
  requested: ['approved', 'rejected'],
  approved: ['received'],
  rejected: [],
  received: ['refunded'],
  refunded: [],
};

export const canReturnTransition = (from: ReturnStatus, to: ReturnStatus): boolean =>
  RETURN_TRANSITIONS[from].includes(to);

export class InvalidReturnTransitionError extends Error {
  constructor(
    readonly from: ReturnStatus,
    readonly to: ReturnStatus,
  ) {
    super(`A return cannot move from ${from} to ${to}`);
    this.name = 'InvalidReturnTransitionError';
  }
}

export function assertReturnTransition(from: ReturnStatus, to: ReturnStatus): void {
  if (!canReturnTransition(from, to)) throw new InvalidReturnTransitionError(from, to);
}

// What the admin may press next; the web shows exactly these buttons.
export const nextReturnStatuses = (from: ReturnStatus): readonly ReturnStatus[] =>
  RETURN_TRANSITIONS[from];

// Statuses whose lines still count against the order: a rejected return frees its quantity again.
export const COUNTING_RETURN_STATUSES: readonly ReturnStatus[] = [
  'requested',
  'approved',
  'received',
  'refunded',
];
