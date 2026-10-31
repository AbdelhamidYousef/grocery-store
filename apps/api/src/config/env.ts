import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

// The single `.env` lives at the repo root so web, api and tooling share it. dotenv is imported
// only here: everything else receives config through this validated object.
dotenv.config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

// Never used in production (the schema below refuses to boot without a real secret); it exists so a
// fresh clone runs after `cp .env.example .env` and tests need no setup.
const DEV_COOKIE_SECRET = 'dev-only-cookie-secret-do-not-use-in-production';

// A key variable that may be absent or empty (`STRIPE_SECRET_KEY=` in a fresh `.env`), but when it
// is set it must be a *test-mode* key: a live key in this portfolio project would charge real
// cards, so it is refused at boot, not just discouraged in a comment.
const testKey = (prefix: string, hint: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.string().startsWith(prefix, `must start with ${prefix} (${hint})`).optional());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    // Only the test harness needs it; optional so the dev server boots without it.
    DATABASE_URL_TEST: z.url().optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Reduced to an origin (scheme + host + port) because that is what browsers send in `Origin`.
    WEB_ORIGIN: z
      .url()
      .default('http://localhost:5173')
      .transform((value) => new URL(value).origin),
    COOKIE_SECRET: z.string().min(32).optional(),
    // General limit per IP; the stricter auth limit is applied per route by the auth module.
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_AUTH_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60_000),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),
    // Optional in development and tests (checkout then answers 502 "payments not configured" and
    // the suite uses a fake gateway); required in production by the refinement below.
    STRIPE_SECRET_KEY: testKey('sk_test_', 'test-mode secret key only'),
    STRIPE_WEBHOOK_SECRET: testKey(
      'whsec_',
      'signing secret from `stripe listen` or the dashboard',
    ),
    // Read by the web build, not the API; validated here too so one typo'd `.env` fails in one place.
    STRIPE_PUBLISHABLE_KEY: testKey('pk_test_', 'test-mode publishable key only'),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.COOKIE_SECRET !== undefined, {
    message: 'COOKIE_SECRET (32+ characters) is required in production',
    path: ['COOKIE_SECRET'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.STRIPE_SECRET_KEY !== undefined, {
    message: 'STRIPE_SECRET_KEY (sk_test_...) is required in production',
    path: ['STRIPE_SECRET_KEY'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.STRIPE_WEBHOOK_SECRET !== undefined, {
    message: 'STRIPE_WEBHOOK_SECRET (whsec_...) is required in production',
    path: ['STRIPE_WEBHOOK_SECRET'],
  })
  .transform((e) => ({ ...e, COOKIE_SECRET: e.COOKIE_SECRET ?? DEV_COOKIE_SECRET }));

// Fail at boot with a readable message instead of at the first request that needs a variable.
export const env = envSchema.parse(process.env);
