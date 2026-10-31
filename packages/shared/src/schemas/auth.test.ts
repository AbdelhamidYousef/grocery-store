import { describe, expect, it } from 'vitest';

import { NewPasswordSchema, PASSWORD_MAX_LENGTH } from '../index.ts';

describe('NewPasswordSchema', () => {
  it('accepts a long enough uncommon password', () => {
    expect(NewPasswordSchema.safeParse('correct-horse-battery').success).toBe(true);
  });

  it('rejects a password under the minimum length', () => {
    expect(NewPasswordSchema.safeParse('short').success).toBe(false);
  });

  it('rejects a password over the maximum length', () => {
    expect(NewPasswordSchema.safeParse('a1'.repeat(PASSWORD_MAX_LENGTH)).success).toBe(false);
  });

  it('rejects a common password whatever its case', () => {
    expect(NewPasswordSchema.safeParse('ILoveMyDog1').success).toBe(false);
  });
});
