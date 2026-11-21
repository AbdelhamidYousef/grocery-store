import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as tracking from '../../lib/track';
import { makeAddress, makeCart, makeCartItem, makeQuote, makeUser } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const tug = makeCartItem({ unitPriceCents: 1099, quantity: 2, lineTotalCents: 2198 });

function serveCart(items = [tug]) {
  server.use(http.get(`${API}/cart`, () => HttpResponse.json({ data: makeCart(items) })));
}

async function fillDetails(user = userEvent.setup()) {
  await user.type(await screen.findByLabelText('Email'), 'sam@example.test');
  await user.type(screen.getByLabelText('Full name'), 'Sam Rivers');
  await user.type(screen.getByLabelText('Address line 1'), '1 Bone Street');
  await user.type(screen.getByLabelText('Postal code'), '10115');
  await user.type(screen.getByLabelText('City'), 'Berlin');
  return user;
}

describe('checkout page', () => {
  it('has nothing to check out with an empty cart', async () => {
    renderApp('/checkout');
    expect(await screen.findByTestId('cart-empty')).toBeVisible();
    expect(screen.queryByTestId('checkout-step')).not.toBeInTheDocument();
  });

  it('sends a shopper with a sold-out line back to the cart', async () => {
    serveCart([makeCartItem({ available: 0, maxQty: 0 })]);
    renderApp('/checkout');
    expect(await screen.findByText(/has sold out/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Review your cart' })).toHaveAttribute('href', '/cart');
  });

  it('shows validation errors on the address step and does not move on', async () => {
    serveCart();
    renderApp('/checkout');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('checkout-continue-shipping'));
    expect(await screen.findByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription('Required');
    expect(screen.getByLabelText('Postal code')).toHaveAccessibleDescription('Required');
    const steps = screen.getAllByTestId('checkout-step');
    expect(steps.map((s) => s.getAttribute('data-state'))).toEqual(['active', 'locked', 'locked']);
  });

  it('starts the address at the postcode chosen at the delivery gate', async () => {
    serveCart();
    renderApp('/checkout?postcode=12045');
    expect(await screen.findByLabelText('Postal code')).toHaveValue('12045');
  });

  it('stops an address outside the delivery areas on the postcode field', async () => {
    serveCart();
    renderApp('/checkout');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'sam@example.test');
    await user.type(screen.getByLabelText('Full name'), 'Sam Rivers');
    await user.type(screen.getByLabelText('Address line 1'), '1 Bone Street');
    await user.type(screen.getByLabelText('Postal code'), '80331');
    await user.type(screen.getByLabelText('City'), 'Munich');
    await user.click(screen.getByTestId('checkout-continue-shipping'));
    await waitFor(() =>
      expect(screen.getByLabelText('Postal code')).toHaveAccessibleDescription(
        "We don't deliver to 80331 yet. We cover Mitte, Neukölln.",
      ),
    );
    const steps = screen.getAllByTestId('checkout-step');
    expect(steps.map((st) => st.getAttribute('data-state'))).toEqual([
      'active',
      'locked',
      'locked',
    ]);
  });

  it('offers a sign-in link to guests and pre-fills a signed-in shopper', async () => {
    serveCart();
    renderApp('/checkout');
    expect(await screen.findByTestId('checkout-sign-in-hint')).toHaveTextContent('Sign in');
    expect(screen.queryByTestId('checkout-save-address')).not.toBeInTheDocument();
  });

  it('pre-fills the form from the default address when signed in', async () => {
    serveCart();
    server.use(
      signedInAs(makeUser({ email: 'ann@example.test' })),
      http.get(`${API}/account/addresses`, () =>
        HttpResponse.json({
          data: [makeAddress({ fullName: 'Ann Lee', line1: '9 Fetch Road', city: 'Hamburg' })],
        }),
      ),
    );
    renderApp('/checkout');
    expect(await screen.findByLabelText('Full name')).toHaveValue('Ann Lee');
    expect(screen.getByLabelText('Email')).toHaveValue('ann@example.test');
    expect(screen.getByLabelText('Address line 1')).toHaveValue('9 Fetch Road');
    expect(screen.getByTestId('checkout-save-address')).not.toBeChecked();
    expect(screen.queryByTestId('checkout-sign-in-hint')).not.toBeInTheDocument();
  });

  it('lists the server quotes, cheapest preselected, and keeps the total unconfirmed', async () => {
    serveCart();
    server.use(
      http.get(`${API}/checkout/shipping-methods`, () =>
        HttpResponse.json({
          data: [
            makeQuote({ priceCents: 490 }),
            makeQuote({ code: 'express', name: 'Express', priceCents: 1190, freeOverCents: null }),
          ],
        }),
      ),
    );
    renderApp('/checkout');
    const user = await fillDetails();
    await user.click(screen.getByTestId('checkout-continue-shipping'));

    const options = await screen.findAllByTestId('shipping-option');
    expect(options).toHaveLength(2);
    expect(within(options[0]!).getByRole('radio')).toBeChecked();
    const summary = screen.getByTestId('checkout-summary');
    expect(summary).toHaveTextContent('€4.90');
    expect(within(summary).getByTestId('order-total')).toHaveTextContent('Confirmed at payment');

    await user.click(within(options[1]!).getByRole('radio'));
    expect(summary).toHaveTextContent('€11.90');
  });

  it('says payments are not configured and never creates an order without a key', async () => {
    serveCart();
    let posted = false;
    server.use(
      http.post(`${API}/checkout`, () => {
        posted = true;
        return HttpResponse.json({}, { status: 500 });
      }),
    );
    renderApp('/checkout');
    const user = await fillDetails();
    await user.click(screen.getByTestId('checkout-continue-shipping'));
    await user.click(await screen.findByTestId('checkout-continue-payment'));

    const note = await screen.findByTestId('payment-not-configured');
    expect(note).toHaveTextContent("Payments aren't configured in this environment");
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('lets the shopper go back and edit a finished step', async () => {
    serveCart();
    renderApp('/checkout');
    const user = await fillDetails();
    await user.click(screen.getByTestId('checkout-continue-shipping'));
    await screen.findAllByTestId('shipping-option');
    const [first] = screen.getAllByTestId('checkout-edit');
    await user.click(first!);
    expect(await screen.findByLabelText('Full name')).toHaveValue('Sam Rivers');
  });

  it('tracks begin_checkout once per visit', async () => {
    const spy = vi.spyOn(tracking, 'track');
    serveCart();
    renderApp('/checkout');
    await screen.findByTestId('checkout-continue-shipping');
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'begin_checkout', valueCents: 2198, currency: 'EUR' }),
    );
  });
});
