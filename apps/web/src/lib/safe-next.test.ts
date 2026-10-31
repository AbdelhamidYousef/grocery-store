import { describe, expect, it } from 'vitest';

import { loginUrl, safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps a same-site path with its query', () => {
    expect(safeNext('/account/addresses?x=1')).toBe('/account/addresses?x=1');
  });

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', ''])(
    'falls back for %j',
    (value) => {
      expect(safeNext(value, '/home')).toBe('/home');
    },
  );

  it('falls back when missing', () => {
    expect(safeNext(null)).toBe('/');
  });

  it('encodes the target in the login link', () => {
    expect(loginUrl('/cart?a=b')).toBe('/login?next=%2Fcart%3Fa%3Db');
  });
});
