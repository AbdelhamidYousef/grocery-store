import { afterEach, describe, expect, it } from 'vitest';

import { captureReferral, clearReferral, readReferral } from './referral-cookie';

afterEach(clearReferral);

describe('referral cookie', () => {
  it('stores a valid ?ref code, upper-cased, and reads it back', () => {
    expect(captureReferral('?ref=pawabcde&utm=x')).toBe(true);
    expect(readReferral()).toBe('PAWABCDE');
  });
  it('ignores a missing, short or hostile value', () => {
    expect(captureReferral('')).toBe(false);
    expect(captureReferral('?ref=ab')).toBe(false);
    expect(captureReferral('?ref=<script>')).toBe(false);
    expect(readReferral()).toBeNull();
  });
  it('can be cleared', () => {
    captureReferral('?ref=PAWABCDE');
    clearReferral();
    expect(readReferral()).toBeNull();
  });
});
