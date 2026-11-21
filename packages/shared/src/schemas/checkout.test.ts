import { describe, expect, it } from 'vitest';

import {
  CheckoutAddressSchema,
  CheckoutRequestSchema,
  OrderNumberParamsSchema,
  OrderStatusSchema,
  SUPPORTED_COUNTRIES,
} from '../index.ts';

const address = {
  fullName: ' Ada Lovelace ',
  line1: '1 Bone Street',
  city: 'Riga',
  postalCode: 'LV-1010',
  country: 'lv',
};

describe('CheckoutAddressSchema', () => {
  it('trims text, upper-cases the country and turns empty optionals into null', () => {
    const parsed = CheckoutAddressSchema.parse({ ...address, line2: '', phone: ' ' });
    expect(parsed).toMatchObject({
      fullName: 'Ada Lovelace',
      country: 'LV',
      line2: null,
      phone: null,
    });
  });

  it('rejects a blank postal code, a blank name and an unsupported country', () => {
    const result = CheckoutAddressSchema.safeParse({
      ...address,
      fullName: '  ',
      postalCode: '',
      country: 'US',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toEqual(expect.arrayContaining(['fullName', 'postalCode', 'country']));
    }
  });

  it('accepts every country on the allow-list', () => {
    for (const country of SUPPORTED_COUNTRIES) {
      expect(CheckoutAddressSchema.safeParse({ ...address, country }).success).toBe(true);
    }
  });
});

describe('CheckoutRequestSchema', () => {
  const request = { email: 'a@b.test', shippingAddress: address, shippingMethodCode: 'standard' };

  it('accepts a minimal request and leaves billing undefined', () => {
    const parsed = CheckoutRequestSchema.parse(request);
    expect(parsed.billingAddress).toBeUndefined();
  });

  it('ignores any price a client tries to send', () => {
    const parsed = CheckoutRequestSchema.parse({ ...request, totalCents: 1, amount: 1 });
    expect(parsed).not.toHaveProperty('totalCents');
    expect(parsed).not.toHaveProperty('amount');
  });

  it('rejects a bad email and a missing shipping method', () => {
    expect(CheckoutRequestSchema.safeParse({ ...request, email: 'nope' }).success).toBe(false);
    expect(CheckoutRequestSchema.safeParse({ ...request, shippingMethodCode: '' }).success).toBe(
      false,
    );
  });
});

describe('order helpers', () => {
  it('knows the seven order statuses', () => {
    expect(OrderStatusSchema.options).toHaveLength(7);
  });

  it('accepts only well-formed order numbers', () => {
    expect(OrderNumberParamsSchema.safeParse({ number: 'GR-2026-000123' }).success).toBe(true);
    expect(OrderNumberParamsSchema.safeParse({ number: 'PW-2026-000123' }).success).toBe(true);
    expect(OrderNumberParamsSchema.safeParse({ number: "PW-2026-1'; drop" }).success).toBe(false);
  });
});
