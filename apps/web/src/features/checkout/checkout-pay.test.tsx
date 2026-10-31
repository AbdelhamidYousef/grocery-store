import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as tracking from '../../lib/track';
import { makeCart, makeCartItem } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

// Stripe.js lives on js.stripe.com and cannot run in jsdom, so the two packages are replaced by
// small stand-ins: Elements renders its children, PaymentElement renders a marker and
// `confirmPayment` is a spy each test scripts. What is tested is OUR wiring (what is sent to
// /checkout, what the button says, how an error or a success is handled), not Stripe's iframe,
// which the Playwright test covers against the real thing when keys exist.
const confirmPayment = vi.fn();
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: ReactNode }) => <div data-testid="elements">{children}</div>,
  PaymentElement: () => <div data-testid="payment-element-stub" />,
  useStripe: () => ({ confirmPayment }),
  useElements: () => ({}),
}));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: () => Promise.resolve({}) }));

beforeEach(() => {
  vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_abc123');
  confirmPayment.mockReset();
  server.use(
    http.get(`${API}/cart`, () =>
      HttpResponse.json({
        data: makeCart([makeCartItem({ unitPriceCents: 1099, quantity: 2, lineTotalCents: 2198 })]),
      }),
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const placed = {
  orderNumber: 'PW-2026-000123',
  clientSecret: 'pi_123_secret_456',
  totals: {
    currency: 'EUR',
    subtotalCents: 2198,
    shippingCents: 490,
    discountCents: 0,
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
      expect(router.state.location.pathname).toBe('/checkout/confirmation/PW-2026-000123'),
    );
    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/checkout/confirmation/PW-2026-000123`,
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
});
