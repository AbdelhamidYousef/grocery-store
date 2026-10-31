import { loadStripe, type Stripe } from '@stripe/stripe-js';

// The publishable key reaches the browser through Vite (`VITE_` prefix). Only `pk_test_` keys are
// accepted: the project is test mode only, so a live key is treated as "not configured" instead of
// being loaded by mistake. Read on every call (not at import time) so tests can stub the env.
export function stripePublishableKey(): string | null {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();
  return key?.startsWith('pk_test_') ? key : null;
}

export const paymentsConfigured = (): boolean => stripePublishableKey() !== null;

// Stripe.js is fetched from js.stripe.com on first use (never bundled: Stripe requires it to come
// from their domain) and the promise is kept, because loading it twice warns and wastes a request.
let loading: Promise<Stripe | null> | null = null;
export function getStripe(): Promise<Stripe | null> | null {
  const key = stripePublishableKey();
  if (!key) return null;
  loading ??= loadStripe(key);
  return loading;
}
