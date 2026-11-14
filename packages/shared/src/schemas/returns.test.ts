import { describe, expect, it } from 'vitest';

import { ReturnRequestBodySchema, returnLineRefundCents } from './returns.ts';

const line = (quantity: number, lineTotalCents: number, discountCents = 0) => ({
  quantity,
  lineTotalCents,
  discountCents,
});

describe('returnLineRefundCents', () => {
  it('refunds the price paid per unit', () => {
    expect(returnLineRefundCents(line(3, 3000), 0, 1)).toBe(1000);
    expect(returnLineRefundCents(line(3, 3000), 0, 3)).toBe(3000);
  });

  it('subtracts the order-level discount allocated to the line', () => {
    expect(returnLineRefundCents(line(2, 2000, 500), 0, 1)).toBe(750);
  });

  it('never loses or invents a cent: the returns of one line add up to what was paid', () => {
    const l = line(3, 3000, 1); // paid 2999, not divisible by 3
    const first = returnLineRefundCents(l, 0, 1);
    const second = returnLineRefundCents(l, 1, 1);
    const last = returnLineRefundCents(l, 2, 1);
    expect([first, second, last]).toEqual([999, 1000, 1000]);
    expect(first + second + last).toBe(2999);
    expect(returnLineRefundCents(l, 0, 3)).toBe(2999);
  });

  it('is zero for a free line (a gift)', () => {
    expect(returnLineRefundCents(line(1, 500, 500), 0, 1)).toBe(0);
  });
});

describe('ReturnRequestBodySchema', () => {
  const item = { orderItemId: '0b0c2f55-4a7b-4c52-9c64-0d6f0b6f6a11', quantity: 1 };
  it('needs a reason and at least one item', () => {
    expect(ReturnRequestBodySchema.safeParse({ reason: 'damaged', items: [] }).success).toBe(false);
    expect(ReturnRequestBodySchema.safeParse({ items: [item] }).success).toBe(false);
    expect(ReturnRequestBodySchema.safeParse({ reason: 'damaged', items: [item] }).success).toBe(
      true,
    );
  });
  it('turns an empty note into null and refuses a whole-number-breaking quantity', () => {
    const parsed = ReturnRequestBodySchema.parse({ reason: 'other', note: '  ', items: [item] });
    expect(parsed.note).toBeNull();
    expect(
      ReturnRequestBodySchema.safeParse({
        reason: 'other',
        items: [{ ...item, quantity: 1.5 }],
      }).success,
    ).toBe(false);
  });
});
