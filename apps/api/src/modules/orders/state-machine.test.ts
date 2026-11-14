import type { OrderStatus } from '@store/shared';
import { describe, expect, it } from 'vitest';

import {
  PROVIDER_ONLY_TRANSITIONS,
  TRANSITIONS,
  assertTransition,
  canTransition,
  requestableNext,
  stockEffect,
  InvalidTransitionError,
} from './state-machine.ts';

const STATUSES = Object.keys(TRANSITIONS) as OrderStatus[];

describe('order state machine', () => {
  // Every one of the 64 (from, to) pairs is asserted against the plan's table, so adding a status
  // or an edge without updating this list fails loudly.
  const allowed: [OrderStatus, OrderStatus][] = [
    ['pending_payment', 'paid'],
    ['pending_payment', 'cancelled'],
    ['paid', 'processing'],
    ['paid', 'refunded'],
    ['paid', 'cancelled'],
    ['processing', 'shipped'],
    ['processing', 'cancelled'],
    ['shipped', 'delivered'],
    ['delivered', 'refunded'],
  ];

  it.each(STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const)))(
    '%s -> %s',
    (from, to) => {
      const expected = allowed.some(([f, t]) => f === from && t === to);
      expect(canTransition(from, to)).toBe(expected);
      if (expected) expect(() => assertTransition(from, to)).not.toThrow();
      else expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
    },
  );

  it('has no way out of cancelled or refunded', () => {
    expect(TRANSITIONS.cancelled).toEqual([]);
    expect(TRANSITIONS.refunded).toEqual([]);
  });

  it('allows a provider-reported refund mid-shipping, but never as a request', () => {
    for (const from of ['processing', 'shipped'] as const) {
      expect(canTransition(from, 'refunded')).toBe(false);
      expect(canTransition(from, 'refunded', { fromProvider: true })).toBe(true);
    }
    // Provider facts never open any other door.
    for (const from of STATUSES) {
      for (const to of PROVIDER_ONLY_TRANSITIONS[from]) expect(to).toBe('refunded');
    }
    expect(canTransition('cancelled', 'refunded', { fromProvider: true })).toBe(false);
  });

  it('never offers paid as a choice', () => {
    expect(requestableNext('pending_payment')).toEqual(['cancelled']);
    expect(requestableNext('paid')).toEqual(['processing', 'refunded', 'cancelled']);
  });

  it('decides stock per transition', () => {
    expect(stockEffect('pending_payment', 'paid')).toBe('commit');
    expect(stockEffect('pending_payment', 'cancelled')).toBe('release');
    expect(stockEffect('paid', 'cancelled')).toBe('restock');
    expect(stockEffect('paid', 'refunded')).toBe('restock');
    expect(stockEffect('processing', 'cancelled')).toBe('restock');
    expect(stockEffect('processing', 'refunded')).toBe('restock');
    // Goods are out of the building: no automatic restock.
    expect(stockEffect('shipped', 'refunded')).toBe('none');
    expect(stockEffect('delivered', 'refunded')).toBe('none');
    expect(stockEffect('paid', 'processing')).toBe('none');
    expect(stockEffect('shipped', 'delivered')).toBe('none');
  });
});
