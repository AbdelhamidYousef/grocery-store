import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { envSchema } from '../config/env.ts';

import { createMailTransport, MemoryTransport } from './mailer.ts';

const log = pino({ level: 'silent' });
const from = 'Grocery <orders@grocery.test>';

describe('createMailTransport', () => {
  it('is disabled in production without any mail configuration (the API still boots)', () => {
    const transport = createMailTransport({ nodeEnv: 'production', from }, log);
    expect(transport.enabled).toBe(false);
  });

  it('is enabled by a Resend key, by an SMTP url, and by default in development (Mailpit)', () => {
    expect(
      createMailTransport({ nodeEnv: 'production', from, resendApiKey: 're_test_123' }, log)
        .enabled,
    ).toBe(true);
    expect(
      createMailTransport({ nodeEnv: 'production', from, smtpUrl: 'smtp://mail:25' }, log).enabled,
    ).toBe(true);
    expect(createMailTransport({ nodeEnv: 'development', from }, log).enabled).toBe(true);
  });
});

describe('mail environment variables', () => {
  const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };
  const prod = {
    ...base,
    NODE_ENV: 'production',
    COOKIE_SECRET: 'x'.repeat(32),
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    WEB_ORIGIN: 'https://grocery.example.app',
  };

  it('are all optional, in production too', () => {
    expect(envSchema.safeParse(prod).success).toBe(true);
    expect(envSchema.safeParse({ ...base, SMTP_URL: '', RESEND_API_KEY: '' }).success).toBe(true);
  });

  it('reject a malformed SMTP url or a key that is not a Resend key', () => {
    expect(envSchema.safeParse({ ...base, SMTP_URL: 'http://x' }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, RESEND_API_KEY: 'sk_live_nope' }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, RESEND_API_KEY: 're_abc' }).success).toBe(true);
  });
});

describe('MemoryTransport', () => {
  it('records messages and can be told to fail', async () => {
    const t = new MemoryTransport();
    t.failNext();
    const msg = { to: 'a@b.c', subject: 's', text: 't', html: 'h', messageId: '<1@x>' };
    await expect(t.send(msg)).rejects.toThrow('SMTP down');
    await t.send(msg);
    expect(t.sent).toHaveLength(1);
  });
});
