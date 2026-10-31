import { describe, expect, it } from 'vitest';

import {
  AddressInputSchema,
  AddressUpdateSchema,
  ChangePasswordSchema,
  UpdateProfileSchema,
} from '../index.ts';

describe('UpdateProfileSchema', () => {
  it('accepts a single changed field', () => {
    expect(UpdateProfileSchema.safeParse({ firstName: ' Sam ' }).data).toEqual({
      firstName: 'Sam',
    });
  });

  it('rejects an empty update', () => {
    expect(UpdateProfileSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(UpdateProfileSchema.safeParse({ lastName: '   ' }).success).toBe(false);
  });
});

describe('ChangePasswordSchema', () => {
  const ok = { currentPassword: 'old-password-1', newPassword: 'a-brand-new-pass-9' };

  it('accepts a different new password', () => {
    expect(ChangePasswordSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects reusing the current password and points at the new field', () => {
    const r = ChangePasswordSchema.safeParse({
      currentPassword: 'same-password-77',
      newPassword: 'same-password-77',
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['newPassword']);
  });

  it('rejects a weak new password', () => {
    expect(ChangePasswordSchema.safeParse({ ...ok, newPassword: 'short' }).success).toBe(false);
  });
});

describe('AddressInputSchema and AddressUpdateSchema', () => {
  const address = {
    fullName: 'Ada Lovelace',
    line1: '1 Bone Street',
    city: 'Riga',
    postalCode: 'LV-1010',
    country: 'lv',
  };

  it('upper-cases the country and maps empty optionals to null', () => {
    expect(AddressInputSchema.parse({ ...address, phone: '' })).toMatchObject({
      country: 'LV',
      phone: null,
    });
  });

  it('rejects a three-letter country', () => {
    expect(AddressInputSchema.safeParse({ ...address, country: 'LVA' }).success).toBe(false);
  });

  it('accepts a partial update but not an empty one', () => {
    expect(AddressUpdateSchema.safeParse({ city: 'Tallinn' }).success).toBe(true);
    expect(AddressUpdateSchema.safeParse({}).success).toBe(false);
  });
});
