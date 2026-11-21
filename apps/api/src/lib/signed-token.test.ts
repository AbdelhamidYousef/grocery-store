import { describe, expect, it } from 'vitest';

import { signToken, verifyToken } from './signed-token.ts';

describe('signed tokens', () => {
  it('verify for the same purpose and subject', () => {
    const token = signToken('swap', 'item-1');
    expect(verifyToken('swap', 'item-1', token)).toBe(true);
  });
  it('fail for another subject, another purpose, a changed token or another secret', () => {
    const token = signToken('swap', 'item-1');
    expect(verifyToken('swap', 'item-2', token)).toBe(false);
    expect(verifyToken('other', 'item-1', token)).toBe(false);
    expect(verifyToken('swap', 'item-1', `${token}x`)).toBe(false);
    expect(verifyToken('swap', 'item-1', '')).toBe(false);
    expect(verifyToken('swap', 'item-1', token, 'a different secret')).toBe(false);
  });
});
