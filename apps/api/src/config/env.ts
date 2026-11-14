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
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.url(),
    // Only the test harness needs it; optional so the dev server boots without it.
    DATABASE_URL_TEST: z.url().optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Reduced to an origin (scheme + host + port) because that is what browsers send in `Origin`.
    WEB_ORIGIN: z
      .url()
      .default('http://localhost:5174')
      .transform((value) => new URL(value).origin),
    // Empty counts as unset: a copied `.env.example` carries `COOKIE_SECRET=` and must boot in dev.
    COOKIE_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32).optional()),
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
    // Shared secret for the test-only payment simulator (POST /test/webhooks/simulate), sent in the
    // `X-Test-Hook-Secret` header. The route exists only when NODE_ENV=test AND this is set, so a
    // server started in test mode by mistake still cannot be told to mark orders paid by anyone
    // who does not know it. 16+ characters; never needed in development or production.
    TEST_HOOK_SECRET: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === '' ? undefined : v))
      .pipe(z.string().min(16, 'use at least 16 characters').optional()),
    // Read by the web build, not the API; validated here too so one typo'd `.env` fails in one place.
    STRIPE_PUBLISHABLE_KEY: testKey('pk_test_', 'test-mode publishable key only'),
    // Email. Development: Mailpit (smtp://127.0.0.1:1026, see docker-compose.yml) when SMTP_URL is
    // empty. Production: RESEND_API_KEY (sent over Resend's SMTP endpoint) or any SMTP_URL; with
    // neither, emails are logged and skipped and the API still boots.
    SMTP_URL: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === '' ? undefined : v))
      .pipe(
        z
          .string()
          .regex(/^smtps?:\/\//, 'must start with smtp:// or smtps://')
          .optional(),
      ),
    RESEND_API_KEY: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === '' ? undefined : v))
      .pipe(z.string().startsWith('re_', 'Resend API keys start with re_').optional()),
    // Resend without a verified domain only accepts `onboarding@resend.dev` as sender, and only
    // delivers to the account owner's address.
    MAIL_FROM: z.string().trim().min(3).default('Pawsome <orders@pawsome.test>'),
    // Where the contact form's notification for the shop goes (Mailpit locally). With the Resend
    // free tier and no verified domain it must be the account owner's address.
    SHOP_INBOX_EMAIL: z.string().trim().min(3).default('hello@pawsome.test'),
    // Review photo uploads (phase 17). Relative paths resolve from apps/api. UPLOADS_ENABLED=false
    // turns live upload off (the public demo: Render's free disk is ephemeral, see lib/uploads.ts).
    UPLOAD_DIR: z.string().trim().min(1).default('uploads'),
    UPLOADS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    // Returns (phase 22). Days after delivery a customer may ask for a return.
    RETURN_WINDOW_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    // Stripe is not configured on a plain dev server, so a return refund would answer 502. With
    // this on (and ONLY then, and only when there is no gateway) the refund is recorded as
    // simulated: `provider_refund_id = sim_...`, labelled so in the admin UI. Never moves money.
    RETURNS_SIMULATED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // Background jobs inside the API process (the stale-reservation sweeper). Tests call the job
    // functions directly, so this only matters for a running server.
    ENABLE_JOBS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    // Shared secret for POST /internal/jobs/run (header `X-Jobs-Secret`), called by the scheduled
    // GitHub Actions workflow. Unset means the route is disabled.
    JOBS_SECRET: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === '' ? undefined : v))
      .pipe(z.string().min(16, 'use at least 16 characters').optional()),
    // Tick the job registry every 10 minutes inside the API process (development convenience).
    JOBS_IN_PROCESS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
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
  // The Origin check (CSRF) and CORS compare against it: left at the localhost default, every
  // browser request in production would be refused, and Secure cookies need https anyway.
  .refine((e) => e.NODE_ENV !== 'production' || e.WEB_ORIGIN.startsWith('https://'), {
    message: 'WEB_ORIGIN must be the https URL of the deployed web app in production',
    path: ['WEB_ORIGIN'],
  })
  .transform((e) => ({ ...e, COOKIE_SECRET: e.COOKIE_SECRET ?? DEV_COOKIE_SECRET }));

// Fail at boot with a readable message instead of at the first request that needs a variable.
export const env = envSchema.parse(process.env);
