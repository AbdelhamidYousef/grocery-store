import { describe, expect, it } from 'vitest';

import { interpolate, makeLookup, pickPlural } from './translate';

describe('interpolate', () => {
  it('fills {name} and leaves unknown placeholders alone', () => {
    expect(interpolate('Hi {name}, {x}', { name: 'Rex' })).toBe('Hi Rex, {x}');
  });
});

describe('pickPlural', () => {
  const forms = { zero: 'none', one: 'one', other: 'many' };
  it('uses `zero` only when defined', () => {
    expect(pickPlural(forms, 0, 'en-IE')).toBe('none');
    expect(pickPlural({ one: 'one', other: 'many' }, 0, 'en-IE')).toBe('many');
  });
  it('English and German: 1 is singular, 2 plural', () => {
    for (const locale of ['en-IE', 'de-DE']) {
      expect(pickPlural({ one: 'one', other: 'many' }, 1, locale)).toBe('one');
      expect(pickPlural({ one: 'one', other: 'many' }, 2, locale)).toBe('many');
    }
  });
  it('French treats 0 and 1 as singular', () => {
    const f = { one: 'one', other: 'many' };
    expect(pickPlural(f, 0, 'fr-FR')).toBe('one');
    expect(pickPlural(f, 1, 'fr-FR')).toBe('one');
    expect(pickPlural(f, 2, 'fr-FR')).toBe('many');
  });
});

describe('makeLookup', () => {
  const english = {
    a: 'English A',
    b: 'English B',
    n: { one: '{count} dog', other: '{count} dogs' },
  };
  const lookup = makeLookup([{ a: 'Deutsch A' }, english], english, 'de-DE');
  it('falls back per key to English and never shows a key', () => {
    expect(lookup.t('a')).toBe('Deutsch A');
    expect(lookup.t('b')).toBe('English B');
    expect(lookup.t('missing')).toBe('missing');
  });
  it('tn fills {count}', () => {
    expect(lookup.tn('n', 2)).toBe('2 dogs');
  });
});
