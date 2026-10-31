import { paymentProvider } from '../lib/errors.ts';
import type {
  CreatePaymentIntentInput,
  PaymentGateway,
  PaymentIntentInfo,
  RefundInfo,
  StripeEvent,
} from '../lib/stripe.ts';

type Method = 'create' | 'update' | 'retrieve' | 'cancel' | 'refund';

// An in-memory PaymentGateway for the order, stock, totals and idempotency tests. It reproduces the
// one Stripe behaviour those tests lean on (the same idempotency key returns the same intent) and
// lets a test script failures. Real Stripe behaviour is covered by the skipped-without-keys suite
// and the signature path by offline tests, so this fake never has to be "realistic".
export class FakeStripe implements PaymentGateway {
  readonly intents = new Map<string, PaymentIntentInfo>();
  readonly byKey = new Map<string, string>();
  readonly calls: { method: Method; args: unknown[] }[] = [];
  /** Intent ids that `cancelPaymentIntent` was asked to cancel. */
  readonly cancelled: string[] = [];
  /** Intent ids refunded through `refundPaymentIntent` (one entry per distinct idempotency key). */
  readonly refunded: string[] = [];
  private refundKeys = new Set<string>();
  private failures: Method[] = [];
  private counter = 0;

  // The next call to `method` (and only that one) rejects like an unavailable provider.
  failNext(method: Method): void {
    this.failures.push(method);
  }

  callsTo(method: Method) {
    return this.calls.filter((c) => c.method === method);
  }

  // Test helper: move an intent to another state, as Stripe would after a payment attempt.
  setStatus(id: string, status: string, amountReceivedCents?: number): void {
    const pi = this.require(id);
    this.intents.set(id, {
      ...pi,
      status,
      amountReceivedCents: amountReceivedCents ?? (status === 'succeeded' ? pi.amountCents : 0),
    });
  }

  private enter(method: Method, ...args: unknown[]): void {
    this.calls.push({ method, args });
    const at = this.failures.indexOf(method);
    if (at !== -1) {
      this.failures.splice(at, 1);
      throw paymentProvider('Fake Stripe is down');
    }
  }

  private require(id: string): PaymentIntentInfo {
    const pi = this.intents.get(id);
    if (!pi) throw paymentProvider(`No such payment_intent: ${id}`);
    return pi;
  }

  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentInfo> {
    return Promise.resolve().then(() => {
      this.enter('create', input);
      const existing = this.byKey.get(input.idempotencyKey);
      if (existing) return this.require(existing);
      const id = `pi_fake_${++this.counter}`;
      const pi: PaymentIntentInfo = {
        id,
        status: 'requires_payment_method',
        amountCents: input.amountCents,
        amountReceivedCents: 0,
        currency: input.currency.toLowerCase(),
        clientSecret: `${id}_secret_fake`,
      };
      this.intents.set(id, pi);
      this.byKey.set(input.idempotencyKey, id);
      return pi;
    });
  }

  updatePaymentIntentAmount(id: string, amountCents: number): Promise<PaymentIntentInfo> {
    return Promise.resolve().then(() => {
      this.enter('update', id, amountCents);
      const updated = { ...this.require(id), amountCents };
      this.intents.set(id, updated);
      return updated;
    });
  }

  retrievePaymentIntent(id: string): Promise<PaymentIntentInfo> {
    return Promise.resolve().then(() => {
      this.enter('retrieve', id);
      return this.require(id);
    });
  }

  cancelPaymentIntent(id: string): Promise<PaymentIntentInfo> {
    return Promise.resolve().then(() => {
      this.enter('cancel', id);
      this.cancelled.push(id);
      const pi = this.require(id);
      if (pi.status === 'succeeded') return pi;
      const cancelled = { ...pi, status: 'canceled' };
      this.intents.set(id, cancelled);
      return cancelled;
    });
  }

  refundPaymentIntent(id: string, idempotencyKey: string): Promise<RefundInfo> {
    return Promise.resolve().then(() => {
      this.enter('refund', id, idempotencyKey);
      this.require(id);
      if (!this.refundKeys.has(idempotencyKey)) {
        this.refundKeys.add(idempotencyKey);
        this.refunded.push(id);
      }
      return { id: `re_fake_${this.refunded.length}`, status: 'succeeded' };
    });
  }

  // No signature check on purpose: webhook signature tests use the real gateway and the SDK's own
  // test-header generator; tests using this fake only need the body parsed.
  constructWebhookEvent(rawBody: Buffer): StripeEvent {
    return JSON.parse(rawBody.toString('utf8')) as StripeEvent;
  }
}
