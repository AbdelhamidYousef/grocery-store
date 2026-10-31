import { describe, expect, it } from 'vitest';

import { ORDER_STATUS_LABELS, isPaidOrLater } from './order-status.ts';
import { OrderStatusSchema } from './schemas/checkout.ts';

describe('isPaidOrLater', () => {
  it.each([
    ['pending_payment', false],
    ['cancelled', false],
    ['paid', true],
    ['processing', true],
    ['shipped', true],
    ['delivered', true],
    ['refunded', true],
  ] as const)('%s -> %s', (status, expected) => {
    expect(isPaidOrLater(status)).toBe(expected);
  });
});

describe('ORDER_STATUS_LABELS', () => {
  it('has a non-empty label for every status', () => {
    for (const status of OrderStatusSchema.options) {
      expect(ORDER_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});
