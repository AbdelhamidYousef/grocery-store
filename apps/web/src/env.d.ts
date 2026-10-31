/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for builds that do not proxy /api (leave unset in dev and on Vercel). */
  readonly VITE_API_URL?: string;
  /** Stripe publishable key (`pk_test_...` only). Without it the payment step says payments are
   * not configured and no order can be placed. */
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
