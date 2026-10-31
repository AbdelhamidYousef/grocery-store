import { describe, expect, it } from 'vitest';

import { hash, verify, verifyAgainstDummy } from './password.ts';

describe('password hashing', () => {
  it('produces an argon2id hash with the documented parameters', async () => {
    const h = await hash('correct horse battery staple');
    expect(h).toMatch(/^\$argon2id\$v=19\$m=65536,p=1,t=3\$/);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const h = await hash('correct horse battery staple');
    expect(await verify(h, 'correct horse battery staple')).toBe(true);
    expect(await verify(h, 'correct horse battery stapl')).toBe(false);
  });

  it('salts every hash, so equal passwords give different hashes', async () => {
    expect(await hash('same-password-1')).not.toBe(await hash('same-password-1'));
  });

  it('treats a malformed stored hash as a mismatch instead of throwing', async () => {
    expect(await verify('test-hash', 'anything')).toBe(false);
  });

  it('never matches the dummy hash used for unknown emails', async () => {
    expect(await verifyAgainstDummy('password')).toBe(false);
  });
});
