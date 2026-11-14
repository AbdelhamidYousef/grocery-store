import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/client';
import { applyFieldErrors, formErrorMessage } from '../features/auth/form-errors';
import { lookupFor, type TFunction } from '../i18n';

import { countryName, countryOptions } from './countries';
import { formatDate } from './format';

describe('formatDate', () => {
  it('formats an ISO date and adds the time on request', () => {
    const iso = '2026-03-05T14:30:00.000Z';
    expect(formatDate(iso)).toMatch(/2026/);
    expect(formatDate(iso, true).length).toBeGreaterThan(formatDate(iso).length);
  });

  it('returns an empty string for something that is not a date', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});

describe('countries', () => {
  it('names a country and falls back to the code when the code is unusable', () => {
    expect(countryName('DE')).toBe('Germany');
    expect(countryName('not a region')).toBe('not a region');
  });

  it('adds an address country that is not in the offered list, once', () => {
    const base = countryOptions().length;
    expect(countryOptions('AU')).toHaveLength(base + 1);
    expect(countryOptions('DE')).toHaveLength(base);
  });
});

describe('formErrorMessage', () => {
  const t: TFunction = (key, params) => lookupFor('en-IE').t(key, params);
  const tm = (m: string) => m;

  it('speaks plainly about network and rate-limit failures, and passes other API messages', () => {
    expect(formErrorMessage(new ApiError('NETWORK', 0, 'x'), t, tm)).toMatch(/Could not reach/);
    expect(formErrorMessage(new ApiError('RATE_LIMITED', 429, 'x'), t, tm)).toMatch(/Too many/);
    expect(formErrorMessage(new ApiError('CONFLICT', 409, 'Taken'), t, tm)).toBe('Taken');
  });

  it('never leaks an unknown error object', () => {
    expect(formErrorMessage(new Error('stack trace here'), t, tm)).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('applyFieldErrors', () => {
  const set = () => {
    const calls: string[] = [];
    return { calls, setError: ((name: string) => calls.push(name)) as never };
  };

  it('ignores anything that is not a validation error with field errors', () => {
    const { calls, setError } = set();
    expect(applyFieldErrors(new Error('x'), setError, ['email'])).toBe(false);
    expect(applyFieldErrors(new ApiError('CONFLICT', 409, 'x'), setError, ['email'])).toBe(false);
    expect(applyFieldErrors(new ApiError('VALIDATION_ERROR', 400, 'x'), setError, ['email'])).toBe(
      false,
    );
    expect(calls).toEqual([]);
  });

  it('maps only the listed fields that have a string message', () => {
    const { calls, setError } = set();
    const error = new ApiError('VALIDATION_ERROR', 400, 'x', {
      fieldErrors: { email: ['Taken'], other: ['ignored'], name: [] },
    });
    expect(applyFieldErrors(error, setError, ['email', 'name'])).toBe(true);
    expect(calls).toEqual(['email']);
  });
});
