import { describe, expect, it } from 'vitest';

import { envSchema } from './env.ts';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };
const prod = { ...base, NODE_ENV: 'production', COOKIE_SECRET: 'x'.repeat(32) };

function problems(source: Record<string, string>): string[] {
  const result = envSchema.safeParse(source);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
}

describe('Stripe configuration', () => {
  it('boots in development and test without any Stripe variable', () => {
    expect(problems(base)).toEqual([]);
    expect(problems({ ...base, NODE_ENV: 'test' })).toEqual([]);
  });

  it('treats an empty value (a fresh .env) as absent', () => {
    expect(
      problems({
        ...base,
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        STRIPE_PUBLISHABLE_KEY: '',
      }),
    ).toEqual([]);
  });

  it('accepts test-mode keys', () => {
    const parsed = envSchema.parse({
      ...base,
      STRIPE_SECRET_KEY: 'sk_test_abc',
      STRIPE_WEBHOOK_SECRET: 'whsec_abc',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_abc',
    });
    expect(parsed.STRIPE_SECRET_KEY).toBe('sk_test_abc');
  });

  it.each([
    ['STRIPE_SECRET_KEY', 'sk_live_abc'],
    ['STRIPE_SECRET_KEY', 'rk_test_abc'],
    ['STRIPE_WEBHOOK_SECRET', 'abc'],
    ['STRIPE_PUBLISHABLE_KEY', 'pk_live_abc'],
  ])('rejects %s = %s', (name, value) => {
    expect(problems({ ...base, [name]: value })).toEqual([name]);
  });

  it('requires the secret key and the webhook secret in production', () => {
    expect(problems(prod)).toEqual(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
    expect(
      problems({ ...prod, STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_WEBHOOK_SECRET: 'whsec_abc' }),
    ).toEqual([]);
  });
});

describe('ENABLE_JOBS', () => {
  it('defaults to on and accepts only true or false', () => {
    expect(envSchema.parse(base).ENABLE_JOBS).toBe(true);
    expect(envSchema.parse({ ...base, ENABLE_JOBS: 'false' }).ENABLE_JOBS).toBe(false);
    expect(problems({ ...base, ENABLE_JOBS: 'yes' })).toEqual(['ENABLE_JOBS']);
  });
});
