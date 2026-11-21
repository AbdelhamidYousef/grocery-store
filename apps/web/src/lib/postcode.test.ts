import { describe, expect, it, vi } from 'vitest';

import {
  POSTCODE_KEY,
  postcodeHeader,
  readPostcode,
  resetPostcodeMemory,
  writePostcode,
} from './postcode';

describe('the remembered postcode', () => {
  it('is empty at first and sends no header', () => {
    expect(readPostcode()).toBeNull();
    expect(postcodeHeader()).toEqual({});
  });

  it('is kept in memory and in storage, and sent as X-Postcode', () => {
    writePostcode('10115');
    expect(readPostcode()).toBe('10115');
    expect(window.localStorage.getItem(POSTCODE_KEY)).toBe('10115');
    expect(postcodeHeader()).toEqual({ 'X-Postcode': '10115' });
    writePostcode(null);
    expect(window.localStorage.getItem(POSTCODE_KEY)).toBeNull();
    expect(postcodeHeader()).toEqual({});
  });

  it('survives a reload (storage only) and ignores junk in storage', () => {
    window.localStorage.setItem(POSTCODE_KEY, '12043');
    resetPostcodeMemory();
    expect(readPostcode()).toBe('12043');
    window.localStorage.setItem(POSTCODE_KEY, 'not-a-postcode');
    resetPostcodeMemory();
    expect(readPostcode()).toBeNull();
  });

  it('keeps working in memory when storage throws', () => {
    const boom = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    writePostcode('10115');
    expect(readPostcode()).toBe('10115');
    boom.mockRestore();
  });
});
