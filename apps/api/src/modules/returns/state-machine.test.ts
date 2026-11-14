import type { ReturnStatus } from '@store/shared';
import { describe, expect, it } from 'vitest';

import {
  COUNTING_RETURN_STATUSES,
  InvalidReturnTransitionError,
  RETURN_TRANSITIONS,
  assertReturnTransition,
  canReturnTransition,
  nextReturnStatuses,
} from './state-machine.ts';

const STATUSES = Object.keys(RETURN_TRANSITIONS) as ReturnStatus[];

describe('return state machine', () => {
  // All 25 (from, to) pairs are asserted, so adding a status or an edge without updating this list
  // fails loudly.
  const allowed: [ReturnStatus, ReturnStatus][] = [
    ['requested', 'approved'],
    ['requested', 'rejected'],
    ['approved', 'received'],
    ['received', 'refunded'],
  ];

  it.each(STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const)))(
    '%s -> %s',
    (from, to) => {
      const expected = allowed.some(([f, t]) => f === from && t === to);
      expect(canReturnTransition(from, to)).toBe(expected);
      if (expected) expect(() => assertReturnTransition(from, to)).not.toThrow();
      else expect(() => assertReturnTransition(from, to)).toThrow(InvalidReturnTransitionError);
    },
  );

  it('has no way out of rejected or refunded', () => {
    expect(nextReturnStatuses('rejected')).toEqual([]);
    expect(nextReturnStatuses('refunded')).toEqual([]);
  });

  it('lets a rejected return free its quantity and counts every other state', () => {
    expect(COUNTING_RETURN_STATUSES).not.toContain('rejected');
    expect(COUNTING_RETURN_STATUSES).toHaveLength(STATUSES.length - 1);
  });
});
