import { createStripeGateway, createUnconfiguredGateway, type PaymentGateway } from './stripe.ts';

export interface GatewayEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  STRIPE_SECRET_KEY?: string | undefined;
  STRIPE_WEBHOOK_SECRET?: string | undefined;
}

export type GatewayKind = 'stripe' | 'fake' | 'unconfigured';

// Which payment gateway the running server uses, decided once at boot:
//   - a Stripe key is set     -> the real Stripe client (test-mode keys only, see config/env.ts);
//   - no key, NODE_ENV=test   -> the in-memory fake, so Playwright can run a whole checkout (with
//                                POST /test/webhooks/simulate paying the order) on a machine or CI
//                                job that has no Stripe account;
//   - no key, anything else   -> "not configured": payment calls answer 502.
// The fake is never reachable in development or production: it needs NODE_ENV=test, which the
// production config refuses to combine with a missing key anyway, and it is imported lazily so a
// normal boot never even loads it. Tested in gateway.test.ts.
export async function selectPaymentGateway(
  env: GatewayEnv,
): Promise<{ kind: GatewayKind; gateway: PaymentGateway }> {
  if (env.STRIPE_SECRET_KEY) {
    return {
      kind: 'stripe',
      gateway: createStripeGateway({
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      }),
    };
  }
  if (env.NODE_ENV === 'test') {
    const { FakeStripe } = await import('../test/fake-stripe.ts');
    return { kind: 'fake', gateway: new FakeStripe() };
  }
  return { kind: 'unconfigured', gateway: createUnconfiguredGateway() };
}
