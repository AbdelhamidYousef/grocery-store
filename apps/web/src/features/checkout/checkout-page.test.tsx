import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as tracking from '../../lib/track';
import { makeAddress, makeCartItem, makeQuote, makeSlotsData, makeUser } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, serveCartWithDelivery, signedInAs } from '../../test/server';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const tug = makeCartItem({ unitPriceCents: 1099, quantity: 2, lineTotalCents: 2198 });

function serveCart(items = [tug]) {
  serveCartWithDelivery(items);
}

// The first open slot of the page (the fixture has a closed one, a full one, then open ones).
const openSlots = async () =>
  (await screen.findAllByTestId('delivery-slot')).filter(
    (b) => b.getAttribute('data-status') === 'open',
  );

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

  it('shows the slots of the day, disables full and closed ones, and keeps the total unconfirmed', async () => {
    serveCart();
    server.use(
      http.get(`${API}/checkout/shipping-methods`, () =>
        HttpResponse.json({
          data: [
            makeQuote({ code: 'slot', name: 'Delivery in your slot', priceCents: 299 }),
            makeQuote({ code: 'express', name: 'Express', priceCents: 499, freeOverCents: null }),
          ],
        }),
      ),
    );
    renderApp('/checkout');
    const user = await fillDetails();
    await user.click(screen.getByTestId('checkout-continue-shipping'));

    const slots = await screen.findAllByTestId('delivery-slot');
    const closed = slots.find((b) => b.getAttribute('data-status') === 'closed');
    const full = slots.find((b) => b.getAttribute('data-status') === 'full');
    expect(closed).toBeDisabled();
    expect(closed).toHaveTextContent('Closed');
    expect(full).toBeDisabled();
    expect(full).toHaveTextContent('Full');
    // Nothing is chosen yet: no way on, and no shipping price in the summary.
    expect(screen.getByTestId('checkout-continue-payment')).toBeDisabled();
    const summary = screen.getByTestId('checkout-summary');
    expect(within(summary).getByTestId('order-total')).toHaveTextContent('Confirmed at payment');

    await user.click((await openSlots())[0]!);
    expect(await screen.findByTestId('delivery-hold')).toHaveTextContent(/Held for 1[45]:\d\d/);
    expect(summary).toHaveTextContent('€2.99');
    expect(screen.getByTestId('checkout-continue-payment')).toBeEnabled();
  });

  it('offers express when the store has a rider free, and charges its own fee', async () => {
    serveCart();
    server.use(
      http.get(`${API}/delivery/slots`, () =>
        HttpResponse.json({
          data: makeSlotsData({ express: { available: true } }),
        }),
      ),
      http.get(`${API}/checkout/shipping-methods`, () =>
        HttpResponse.json({
          data: [
            makeQuote({ code: 'slot', priceCents: 299 }),
            makeQuote({ code: 'express', name: 'Express', priceCents: 499, freeOverCents: null }),
          ],
        }),
      ),
    );
    renderApp('/checkout');
    const user = await fillDetails();
    await user.click(screen.getByTestId('checkout-continue-shipping'));

    const express = await screen.findByTestId('delivery-express');
    expect(express).toHaveTextContent('At your door in about 30 minutes');
    expect(express).toHaveTextContent('€4.99');
    await user.click(express);
    await waitFor(() => expect(express).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByTestId('checkout-summary')).toHaveTextContent('€4.99');
  });

  it('says why express is not offered, and lets the shopper pick a slot of another day', async () => {
    serveCart();
    renderApp('/checkout');
    const user = await fillDetails();
    await user.click(screen.getByTestId('checkout-continue-shipping'));
    expect(await screen.findByTestId('delivery-express')).toHaveTextContent(
      'Express is only offered while the store is open.',
    );
    const tabs = screen.getAllByTestId('delivery-day-tab');
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    expect(tabs[0]).toHaveTextContent('Today');
    expect(tabs[1]).toHaveTextContent('Tomorrow');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    await user.click(tabs[1]!);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    // The fixture's slots are relative to the clock, so the second day holds one open slot in the
    // morning and three in the evening: count it from the same data instead of assuming one.
    const secondDay = makeSlotsData().days[1]!;
    expect(await openSlots()).toHaveLength(
      secondDay.slots.filter((slot) => slot.status === 'open').length,
    );
  });

  it('tells the shopper when a slot filled up in the meantime and keeps the picker', async () => {
    serveCart();
    server.use(
      http.put(`${API}/cart/slot`, () =>
        HttpResponse.json(
          { error: { code: 'SLOT_FULL', message: 'This slot is full' } },
          { status: 409 },
        ),
      ),
    );
    renderApp('/checkout');
    const user = await fillDetails();
    await user.click(screen.getByTestId('checkout-continue-shipping'));
    await user.click((await openSlots())[0]!);
    expect(await screen.findByTestId('delivery-problem')).toHaveTextContent(
      'That slot just filled up. Pick another time.',
    );
    expect(screen.getByTestId('checkout-continue-payment')).toBeDisabled();
  }, 15_000);

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
    await user.click((await openSlots())[0]!);
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
    await screen.findAllByTestId('delivery-slot');
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
