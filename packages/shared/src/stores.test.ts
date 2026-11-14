import { describe, expect, it } from 'vitest';

import { formatMoney } from './money.ts';
import {
  DEFAULT_STORE,
  STORE_CODES,
  STORES,
  isStoreCode,
  storeCodeSchema,
  storeFromCode,
  storeFromLanguages,
} from './stores.ts';

describe('store registry', () => {
  it('has unique codes that match the code union', () => {
    const codes = STORES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual([...STORE_CODES].sort());
  });

  it('uses a currency and locale that formatMoney supports', () => {
    for (const store of STORES) {
      expect(formatMoney(123456, store.currency, store.locale)).toMatch(/\d/);
      expect(Intl.NumberFormat.supportedLocalesOf(store.locale)).toHaveLength(1);
    }
    expect(formatMoney(123456, 'EUR', 'de-DE')).toMatch(/^1\.234,56\s€$/);
    expect(formatMoney(123456, 'EUR', 'en-IE')).toMatch(/1,234\.56/);
  });

  it('ships every store view to at least one country, as ISO alpha-2 codes', () => {
    for (const store of STORES) {
      expect(store.shipCountries.length).toBeGreaterThan(0);
      for (const c of store.shipCountries) expect(c).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('has exactly two store views, English and German, both EUR and shipping to DE', () => {
    expect(STORES.map((s) => [s.code, s.lang, s.locale, s.label, s.currency])).toEqual([
      ['de-en', 'en', 'en-IE', 'English', 'EUR'],
      ['de-de', 'de', 'de-DE', 'Deutsch', 'EUR'],
    ]);
    for (const store of STORES) expect(store.shipCountries).toEqual(['DE']);
  });

  it('defaults to de-en and looks stores up by code', () => {
    expect(DEFAULT_STORE.code).toBe('de-en');
    expect(storeFromCode('de-de')?.currency).toBe('EUR');
    expect(storeFromCode('uk-en')).toBeUndefined();
    expect(storeFromCode('xx-yy')).toBeUndefined();
    expect(storeFromCode(null)).toBeUndefined();
  });

  it('validates codes', () => {
    expect(storeCodeSchema.safeParse('de-de').success).toBe(true);
    expect(storeCodeSchema.safeParse('DE-de').success).toBe(false);
    expect(isStoreCode('fr-fr')).toBe(false);
    expect(isStoreCode('de-en')).toBe(true);
    expect(isStoreCode(42)).toBe(false);
  });

  it('picks a store from browser languages', () => {
    expect(storeFromLanguages(['de-DE', 'en']).code).toBe('de-de');
    expect(storeFromLanguages(['de-AT']).code).toBe('de-de');
    expect(storeFromLanguages(['fr']).code).toBe('de-en');
    expect(storeFromLanguages(['en-GB']).code).toBe('de-en');
    expect(storeFromLanguages(['en-US']).code).toBe('de-en');
    expect(storeFromLanguages(['ja']).code).toBe('de-en');
    expect(storeFromLanguages([]).code).toBe('de-en');
  });
});
