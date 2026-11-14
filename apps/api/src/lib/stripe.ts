import Stripe from 'stripe';

import { paymentProvider } from './errors.ts';

// Pinned on purpose. Stripe changes API behaviour per version; without a pin the account's default
// version would decide what our requests and webhook payloads look like, and a dashboard upgrade
// could silently change them. Bumping this is a deliberate commit (the SDK's types match it).
export const STRIPE_API_VERSION = '2026-10-28.endive';

// The slice of a PaymentIntent the app uses, in our own words. Keeping the SDK's types out of the
// services means a fake gateway in tests is ~100 lines, and the rest of the code reads the same
// whichever provider is behind it.
export interface PaymentIntentInfo {
  id: string;
  /** Stripe's status string, e.g. requires_payment_method, processing, succeeded, canceled. */
  status: string;
  amountCents: number;
  amountReceivedCents: number;
  /** Lower-case ISO code, as Stripe returns it. */
  currency: string;
  /** Null only if Stripe omitted it; checkout treats that as a provider error. */
  clientSecret: string | null;
}

export interface CreatePaymentIntentInput {
  amountCents: number;
  currency: string;
  orderId: string;
  orderNumber: string;
  email: string;
  // Same key + same parameters = same PaymentIntent back, however many times we retry. See below.
  idempotencyKey: string;
}

// Minimal event shape the handlers rely on; the SDK's `Stripe.Event` satisfies it.
export interface StripeEvent {
  id: string;
  type: string;
  data: { object: unknown };
}

// Thrown when a webhook body does not carry a valid signature for our secret.
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export interface RefundInfo {
  id: string;
  /** Stripe's refund status: succeeded, pending, failed, canceled. */
  status: string;
}

export interface PaymentGateway {
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentInfo>;
  // Changing the amount of a not-yet-paid intent (the shopper edited their cart before paying).
  updatePaymentIntentAmount(id: string, amountCents: number): Promise<PaymentIntentInfo>;
  retrievePaymentIntent(id: string): Promise<PaymentIntentInfo>;
  // Idempotent: cancelling an already-cancelled intent returns it instead of throwing.
  cancelPaymentIntent(id: string): Promise<PaymentIntentInfo>;
  // Returns money to the customer: the whole remaining charge, or `amountCents` of it (a partial
  // refund, used by returns). Idempotent per key, and an already-refunded intent is an answer
  // ("done"), not a failure, so a retry after a timeout is always safe. Asking for more than is
  // left to refund is a provider error (502), never silently clamped.
  refundPaymentIntent(
    id: string,
    idempotencyKey: string,
    amountCents?: number,
  ): Promise<RefundInfo>;
  /** `rawBody` must be the exact bytes Stripe sent: the signature covers them, not the JSON. */
  constructWebhookEvent(rawBody: Buffer, signature: string | undefined): StripeEvent;
}

function toInfo(pi: Stripe.PaymentIntent): PaymentIntentInfo {
  return {
    id: pi.id,
    status: pi.status,
    amountCents: pi.amount,
    amountReceivedCents: pi.amount_received,
    currency: pi.currency,
    clientSecret: pi.client_secret,
  };
}

export interface StripeGatewayOptions {
  secretKey: string;
  /** Needed only to verify webhooks; absent means webhooks are refused, not accepted unchecked. */
  webhookSecret?: string | undefined;
}

// One SDK instance for the process. A PaymentIntent is Stripe's record of *one attempt to collect
// one amount*: it moves through requires_payment_method -> (requires_action) -> processing ->
// succeeded, and each card try becomes a Charge attached to it. We create the intent before the
// shopper pays (so the browser can confirm it with the client secret) and learn the outcome from
// the webhook, never from the browser.
export function createStripeGateway(options: StripeGatewayOptions): PaymentGateway {
  const stripe = new Stripe(options.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    // The contract's budget for a Stripe call is 10 s. The SDK retries network failures on its own
    // (twice), and that is only safe because every create carries an idempotency key.
    timeout: 10_000,
    maxNetworkRetries: 2,
  });

  // Every provider failure leaves here as one AppError (502); the original stays on `cause`.
  async function call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw paymentProvider('The payment service is unavailable', err);
    }
  }

  return {
    // Idempotency key: Stripe remembers the key for 24 h and, for a repeat of the same request,
    // returns the first response instead of creating a second intent. If our process dies after
    // Stripe answers but before we store the id, or an automatic retry overlaps the original, the
    // customer is still never charged through two intents for one order.
    createPaymentIntent: (input) =>
      call(async () =>
        toInfo(
          await stripe.paymentIntents.create(
            {
              amount: input.amountCents,
              currency: input.currency.toLowerCase(),
              // Lets Stripe offer whatever payment methods the dashboard enables, without a code change.
              automatic_payment_methods: { enabled: true },
              receipt_email: input.email,
              description: `Pawsome order ${input.orderNumber}`,
              // The webhook finds the order from our own table by intent id; the metadata is for
              // humans reading the Stripe dashboard.
              metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
            },
            { idempotencyKey: input.idempotencyKey },
          ),
        ),
      ),

    updatePaymentIntentAmount: (id, amountCents) =>
      call(async () => toInfo(await stripe.paymentIntents.update(id, { amount: amountCents }))),

    retrievePaymentIntent: (id) =>
      call(async () => toInfo(await stripe.paymentIntents.retrieve(id))),

    cancelPaymentIntent: (id) =>
      call(async () => {
        try {
          return toInfo(await stripe.paymentIntents.cancel(id));
        } catch (err) {
          // Already cancelled (or succeeded) is an answer, not a failure: report the real state.
          if (
            err instanceof Stripe.errors.StripeError &&
            err.code === 'payment_intent_unexpected_state'
          ) {
            return toInfo(await stripe.paymentIntents.retrieve(id));
          }
          throw err;
        }
      }),

    refundPaymentIntent: (id, idempotencyKey, amountCents) =>
      call(async () => {
        try {
          // Stripe's `amount` is in the currency's smallest unit (cents), like ours. Left out, the
          // refund covers whatever is still refundable on the charge.
          const refund = await stripe.refunds.create(
            { payment_intent: id, ...(amountCents !== undefined && { amount: amountCents }) },
            { idempotencyKey },
          );
          return { id: refund.id, status: refund.status ?? 'pending' };
        } catch (err) {
          if (err instanceof Stripe.errors.StripeError && err.code === 'charge_already_refunded') {
            return { id: 'already_refunded', status: 'succeeded' };
          }
          throw err;
        }
      }),

    constructWebhookEvent(rawBody, signature) {
      if (!options.webhookSecret) throw paymentProvider('Webhooks are not configured');
      if (!signature) throw new WebhookSignatureError('Missing Stripe-Signature header');
      try {
        // Verifies the HMAC over the raw bytes and that the timestamp is within 5 minutes (replay).
        return stripe.webhooks.constructEvent(rawBody, signature, options.webhookSecret);
      } catch (err) {
        throw new WebhookSignatureError(err instanceof Error ? err.message : 'Invalid signature');
      }
    },
  };
}

// Used when no key is configured (a fresh clone, or CI that only runs unrelated tests): the app
// boots and everything else works, and anything touching payments fails loudly and identically.
export function createUnconfiguredGateway(): PaymentGateway {
  const error = () => paymentProvider('Payments are not configured on this server');
  // Rejected promises, not sync throws: callers `await` these and must see one failure style.
  const reject = (): Promise<never> => Promise.reject(error());
  return {
    createPaymentIntent: reject,
    updatePaymentIntentAmount: reject,
    retrievePaymentIntent: reject,
    cancelPaymentIntent: reject,
    refundPaymentIntent: reject,
    constructWebhookEvent: () => {
      throw error();
    },
  };
}
