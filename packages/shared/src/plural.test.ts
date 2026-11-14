import { describe, expect, it } from 'vitest';

import { interpolate, pickPlural } from './plural.ts';

describe('pickPlural', () => {
  const forms = { one: '{count} day', other: '{count} days' };
  it('uses the language rule: French counts 0 and 1 as singular, English only 1', () => {
    expect(pickPlural(forms, 1, 'en')).toBe('{count} day');
    expect(pickPlural(forms, 0, 'en')).toBe('{count} days');
    expect(pickPlural(forms, 0, 'fr')).toBe('{count} day');
    expect(pickPlural(forms, 2, 'de')).toBe('{count} days');
  });
  it('lets a zero form win for exactly 0', () => {
    expect(pickPlural({ ...forms, zero: 'none' }, 0, 'en')).toBe('none');
    expect(pickPlural({ ...forms, zero: 'none' }, 3, 'en')).toBe('{count} days');
  });
});

describe('interpolate', () => {
  it('fills known holes and leaves unknown ones visible', () => {
    expect(interpolate('Hi {name}, {x}', { name: 'Ada' })).toBe('Hi Ada, {x}');
    expect(interpolate('plain')).toBe('plain');
  });
});
