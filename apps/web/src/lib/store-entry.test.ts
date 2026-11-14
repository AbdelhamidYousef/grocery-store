import { storeFromCode } from '@store/shared';
import { describe, expect, it } from 'vitest';

import { pickStore, resolveEntry, swapStorePrefix } from './store-entry';

const url = (pathname: string, search = '', hash = '') => ({ pathname, search, hash });
const de = () => storeFromCode('de-de')!;

describe('resolveEntry', () => {
  it('uses a valid prefix as the basename and leaves the URL alone', () => {
    expect(resolveEntry(url('/de-de/c/dogs', '?sort=price'))).toEqual({
      basename: '/de-de',
      replaceWith: null,
    });
    expect(resolveEntry(url('/de-en'))).toEqual({ basename: '/de-en', replaceWith: null });
  });

  it('sends a legacy path to the picked store, keeping query and hash', () => {
    expect(resolveEntry(url('/products/rope-tug', '?v=1', '#reviews'), de)).toEqual({
      basename: '/de-de',
      replaceWith: '/de-de/products/rope-tug?v=1#reviews',
    });
  });

  it('sends the bare root to the picked store, and to de-en by default', () => {
    expect(resolveEntry(url('/'), de).replaceWith).toBe('/de-de');
    expect(resolveEntry(url('/', '?ref=ABC')).replaceWith).toBe('/de-en?ref=ABC');
  });

  it('keeps the admin un-prefixed, and tidies a prefixed admin URL', () => {
    expect(resolveEntry(url('/admin/products'))).toEqual({ basename: '', replaceWith: null });
    expect(resolveEntry(url('/de-en/admin/orders', '?page=2'))).toEqual({
      basename: '',
      replaceWith: '/admin/orders?page=2',
    });
  });

  it('sends the prefixes of the old multi-country shop to the English view, keeping the rest', () => {
    expect(resolveEntry(url('/eu-en/c/dogs', '?page=2', '#top'))).toEqual({
      basename: '/de-en',
      replaceWith: '/de-en/c/dogs?page=2#top',
    });
    expect(resolveEntry(url('/uk-en')).replaceWith).toBe('/de-en');
    expect(resolveEntry(url('/fr-fr/'), de).replaceWith).toBe('/de-en');
  });

  it('does not treat an unknown store-like prefix as a legacy path (it is a 404)', () => {
    expect(resolveEntry(url('/xx-yy/c/dogs'))).toEqual({ basename: '', replaceWith: null });
  });
});

describe('pickStore', () => {
  it('prefers the remembered store, then the browser language, then the default', () => {
    expect(pickStore('de-en', ['de-DE']).code).toBe('de-en');
    expect(pickStore('fr-fr', ['de-DE']).code).toBe('de-de');
    expect(pickStore('nope', ['de-DE']).code).toBe('de-de');
    expect(pickStore(null, []).code).toBe('de-en');
  });
});

describe('swapStorePrefix', () => {
  it('swaps the prefix and keeps path, query and hash', () => {
    const en = storeFromCode('de-en')!;
    expect(swapStorePrefix(url('/de-de/products/rope-tug', '?v=2', '#faq'), '/de-de', en)).toBe(
      '/de-en/products/rope-tug?v=2#faq',
    );
    expect(swapStorePrefix(url('/de-de'), '/de-de', en)).toBe('/de-en');
    expect(swapStorePrefix(url('/de-de/'), '/de-de', en)).toBe('/de-en');
  });

  it('prefixes a path that had no store (admin, 404)', () => {
    expect(swapStorePrefix(url('/xx-yy/foo'), '', de())).toBe('/de-de/xx-yy/foo');
  });
});
