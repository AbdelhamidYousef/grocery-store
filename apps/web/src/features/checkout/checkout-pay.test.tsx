import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStripe } from '../../lib/stripe';
import * as tracking from '../../lib/track';
import { makeCartItem } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, serveCartWithDelivery } from '../../test/server';

// Stripe.js lives on js.stripe.com and cannot run in jsdom, so the two packages are replaced by
// small stand-ins: Elements renders its children, PaymentElement renders a marker and
// `confirmPayment` is a spy each test scripts. What is tested is OUR wiring (what is sent to
// /checkout, what the button says, how an error or a success is handled), not Stripe's iframe,
// which the Playwright test covers against the real thing when keys exist.
const confirmPayment = vi.fn();
// `loadStripe` and the element's load-error callback are scripted by the load-failure tests.
const stripe = vi.hoisted(() => ({
  loadStripe: (): Promise<unknown> => Promise.resolve({}),
  failElement: undefined as (() => void) | undefined,
}));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: ReactNode }) => <div data-testid="elements">{children}</div>,
  PaymentElement: ({ onLoadError }: { onLoadError?: () => void }) => {
    stripe.failElement = onLoadError;
    return <div data-testid="payment-element-stub" />;
  },
  useStripe: () => ({ confirmPayment }),
  useElements: () => ({}),
}));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: () => stripe.loadStripe() }));

beforeEach(() => {
  resetStripe();
  stripe.loadStripe = () => Promise.resolve({});
  stripe.failElement = undefined;
  vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_abc123');
  confirmPayment.mockReset();
  serveCartWithDelivery([
    makeCartItem({ unitPriceCents: 1099, quantity: 2, lineTotalCents: 2198 }),
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const placed = {
  orderNumber: 'GR-2026-000123',
  clientSecret: 'pi_123_secret_456',
  totals: {
    currency: 'EUR',
    subtotalCents: 2198,
    shippingCents: 490,
    deliveryFeeCents: null,
    depositCents: 0,
    bagFeeCents: 0,
    discountCents: 0,
    donationCents: 0,
    taxCents: 0,
    totalCents: 2688,
  },
};

async function reachPayment() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), 'sam@example.test');
  await user.type(screen.getByLabelText('Full name'), 'Sam Rivers');
  await user.type(screen.getByLabelText('Address line 1'), '1 Bone Street');
  await user.type(screen.getByLabelText('Postal code'), '10115');
  await user.type(screen.getByLabelText('City'), 'Berlin');
  await user.click(screen.getByTestId('checkout-continue-shipping'));
  // Pick the first open delivery time (the picker lists a closed and a full one before it).
  const slots = await screen.findAllByTestId('delivery-slot');
  await user.click(slots.find((b) => b.getAttribute('data-status') === 'open')!);
  await user.click(await screen.findByTestId('checkout-continue-payment'));
  return user;
}

describe('checkout payment step with a Stripe key', () => {
  it('places the order without any price and shows the server total on the pay button', async () => {
    const spy = vi.spyOn(tracking, 'track');
    let body: unknown;
    server.use(
      http.post(`${API}/checkout`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: placed });
      }),
    );
    renderApp('/checkout');
    await reachPayment();

    expect(await screen.findByRole('button', { name: 'Pay €26.88' })).toBeEnabled();
    expect(screen.getByTestId('payment-element-stub')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-summary')).toHaveTextContent('€26.88');
    expect(body).toMatchObject({
      email: 'sam@example.test',
      shippingMethodCode: 'standard',
      shippingAddress: { fullName: 'Sam Rivers', country: 'DE', postalCode: '10115' },
    });
    expect(JSON.stringify(body)).not.toMatch(/cents|total|price/i);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'add_payment_info', valueCents: 2688 }),
    );
  });

  it('tells the shopper a code stopped applying and offers the way back to the cart', async () => {
    const message = 'You have already used this code';
    server.use(
      http.post(`${API}/checkout`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message,
              details: { formErrors: [], fieldErrors: { code: [message] } },
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderApp('/checkout');
    await reachPayment();
    expect(await screen.findByTestId('checkout-error')).toHaveTextContent(message);
    const problem = screen.getByTestId('checkout-code-problem');
    expect(problem).toHaveTextContent(message);
    expect(within(problem).getByRole('link', { name: /Back to your cart/ })).toHaveAttribute(
      'href',
      '/cart',
    );
  });

  it('shows a card error inline and stays on the page', async () => {
    server.use(http.post(`${API}/checkout`, () => HttpResponse.json({ data: placed })));
    confirmPayment.mockResolvedValue({
      error: { type: 'card_error', message: 'Your card was declined.' },
    });
    const router = renderApp('/checkout');
    const user = await reachPayment();
    await user.click(await screen.findByTestId('pay-button'));

    expect(await screen.findByTestId('payment-error')).toHaveTextContent('Your card was declined.');
    expect(router.state.location.pathname).toBe('/checkout');
    expect(screen.getByTestId('pay-button')).toBeEnabled();
  });

  it('hides an unexpected Stripe error behind a calm message', async () => {
    server.use(http.post(`${API}/checkout`, () => HttpResponse.json({ data: placed })));
    confirmPayment.mockResolvedValue({ error: { type: 'api_error', message: 'req_x internal' } });
    renderApp('/checkout');
    const user = await reachPayment();
    await user.click(await screen.findByTestId('pay-button'));
    const error = await screen.findByTestId('payment-error');
    expect(error).toHaveTextContent('You have not been charged');
    expect(error).not.toHaveTextContent('req_x');
  });

  it('goes to the confirmation page once Stripe accepts the payment', async () => {
    server.use(
      http.post(`${API}/checkout`, () => HttpResponse.json({ data: placed })),
      http.get(`${API}/checkout/orders/:number/status`, () =>
        HttpResponse.json({ data: { status: 'pending_payment', paymentStatus: 'processing' } }),
      ),
    );
    confirmPayment.mockResolvedValue({});
    const router = renderApp('/checkout');
    const user = await reachPayment();
    await user.click(await screen.findByTestId('pay-button'));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/checkout/confirmation/GR-2026-000123'),
    );
    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/checkout/confirmation/GR-2026-000123`,
        },
      }),
    );
  });

  it('explains a 409 CART_CHANGED and stays on the shipping step', async () => {
    server.use(
      http.post(`${API}/checkout`, () =>
        HttpResponse.json(
          { error: { code: 'CART_CHANGED', message: 'Your cart changed' } },
          { status: 409 },
        ),
      ),
    );
    renderApp('/checkout');
    await reachPayment();
    expect(await screen.findByTestId('checkout-error')).toHaveTextContent(
      'Something in your cart changed',
    );
    expect(screen.getByTestId('checkout-continue-payment')).toBeEnabled();
  });

  it('sends a 422 POSTCODE_NOT_SERVED back to the address, on the postcode field', async () => {
    server.use(
      http.post(`${API}/checkout`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'POSTCODE_NOT_SERVED',
              message: "We don't deliver to 10115 yet.",
              details: { postcode: '10115', areas: ['Mitte', 'Neukölln'] },
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderApp('/checkout');
    await reachPayment();
    expect(await screen.findByLabelText('Postal code')).toHaveAccessibleDescription(
      "We don't deliver to 10115 yet. We cover Mitte, Neukölln.",
    );
    const steps = screen.getAllByTestId('checkout-step');
    expect(steps.map((st) => st.getAttribute('data-state'))).toEqual([
      'active',
      'locked',
      'locked',
    ]);
  });

  it('sends an expired slot hold back to the delivery time, with the reason and fresh slots', async () => {
    server.use(
      http.post(`${API}/checkout`, () =>
        HttpResponse.json(
          { error: { code: 'SLOT_HOLD_EXPIRED', message: 'Your delivery slot has expired' } },
          { status: 409 },
        ),
      ),
    );
    renderApp('/checkout');
    await reachPayment();
    expect(await screen.findByTestId('checkout-error')).toHaveTextContent(
      'Your slot was held for 15 minutes and has run out. Pick a time again.',
    );
    const steps = screen.getAllByTestId('checkout-step');
    expect(steps.map((st) => st.getAttribute('data-state'))).toEqual(['done', 'active', 'locked']);
  });

  it('explains a 502 payment provider failure as retryable', async () => {
    server.use(
      http.post(`${API}/checkout`, () =>
        HttpResponse.json(
          { error: { code: 'PAYMENT_PROVIDER_ERROR', message: 'Stripe is down' } },
          { status: 502 },
        ),
      ),
    );
    renderApp('/checkout');
    await reachPayment();
    expect(await screen.findByTestId('checkout-error')).toHaveTextContent(
      'You have not been charged',
    );
  });

  it('treats a live key as not configured', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_live_nope');
    renderApp('/checkout');
    await reachPayment();
    expect(await screen.findByTestId('payment-not-configured')).toBeVisible();
  });

  describe("when Stripe's form cannot load", () => {
    beforeEach(() => {
      server.use(http.post(`${API}/checkout`, () => HttpResponse.json({ data: placed })));
    });

    it('says so, keeps the order, and recovers on Try again when Stripe.js fails to load', async () => {
      stripe.loadStripe = () => Promise.reject(new Error('Failed to load Stripe.js'));
      renderApp('/checkout');
      const user = await reachPayment();

      const alert = await screen.findByTestId('payment-load-error');
      expect(alert).toHaveTextContent('could not load the secure payment form');
      expect(alert).toHaveTextContent('Nothing was charged');
      expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();

      stripe.loadStripe = () => Promise.resolve({});
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('button', { name: 'Pay €26.88' })).toBeEnabled();
      expect(screen.queryByTestId('payment-load-error')).not.toBeInTheDocument();
    });

    it('shows the same state when the payment iframe reports a load error', async () => {
      renderApp('/checkout');
      const user = await reachPayment();
      await screen.findByTestId('payment-element-stub');

      act(() => stripe.failElement?.());
      expect(await screen.findByTestId('payment-load-error')).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByTestId('payment-element-stub')).toBeInTheDocument();
    });
  });
});
