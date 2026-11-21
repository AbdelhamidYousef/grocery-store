import { act, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as tracking from '../../lib/track';
import { makeCart, makeCartItem, makeOrder } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

const NUMBER = 'PW-2026-000123';
const PATH = `/checkout/confirmation/${NUMBER}`;

const statusOf = (status: string, paymentStatus: string | null = null) =>
  http.get(`${API}/checkout/orders/:number/status`, () =>
    HttpResponse.json({ data: { status, paymentStatus } }),
  );
const orderOf = (order = makeOrder()) =>
  http.get(`${API}/checkout/orders/:number`, () => HttpResponse.json({ data: order }));

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('confirmation page', () => {
  it('shows the paid order with its items, totals and address', async () => {
    server.use(statusOf('paid', 'succeeded'), orderOf());
    renderApp(PATH);

    const status = await screen.findByTestId('confirmation-status');
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'paid'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your payment is secured.');
    expect(screen.getByTestId('confirmation-order-number')).toHaveTextContent(NUMBER);

    const summary = await screen.findByTestId('order-summary');
    expect(within(summary).getByText('Rope Tug')).toBeVisible();
    expect(within(summary).getByTestId('order-total')).toHaveTextContent('€26.89');
    expect(screen.getByTestId('order-address')).toHaveTextContent('1 Bone Street');
  });

  it('shows the delivery window the shopper picked, in Berlin time', async () => {
    const slot = {
      kind: 'slot' as const,
      from: '2026-11-23T13:00:00.000Z',
      to: '2026-11-23T14:00:00.000Z',
    };
    server.use(statusOf('paid', 'succeeded'), orderOf(makeOrder({ delivery: slot })));
    renderApp(PATH);
    expect(await screen.findByTestId('delivery-order-window')).toHaveTextContent(
      /^Arrives Mon.*23.*Nov 14:00–15:00$/,
    );
  });

  it('shows express by the end of its 30-minute window', async () => {
    const express = {
      kind: 'express' as const,
      from: '2026-11-23T13:00:00.000Z',
      to: '2026-11-23T13:30:00.000Z',
    };
    server.use(statusOf('paid', 'succeeded'), orderOf(makeOrder({ delivery: express })));
    renderApp(PATH);
    expect(await screen.findByTestId('delivery-order-window')).toHaveTextContent(
      'Express, by 14:30',
    );
  });

  it('shows no delivery window for an order from before slots', async () => {
    server.use(statusOf('paid', 'succeeded'), orderOf(makeOrder({ delivery: null })));
    renderApp(PATH);
    await screen.findByTestId('order-summary');
    expect(screen.queryByTestId('delivery-order-window')).not.toBeInTheDocument();
  });

  it('polls until the webhook flips the order to paid, then refreshes the cart', async () => {
    let calls = 0;
    let cartReads = 0;
    server.use(
      http.get(`${API}/checkout/orders/:number/status`, () => {
        calls += 1;
        return HttpResponse.json({
          data:
            calls < 2
              ? { status: 'pending_payment', paymentStatus: 'processing' }
              : { status: 'paid', paymentStatus: 'succeeded' },
        });
      }),
      orderOf(),
      http.get(`${API}/cart`, () => {
        cartReads += 1;
        return HttpResponse.json({ data: makeCart([makeCartItem()]) });
      }),
    );
    renderApp(PATH);
    const status = await screen.findByTestId('confirmation-status');
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'pending'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Confirming your payment');

    await waitFor(() => expect(status).toHaveAttribute('data-state', 'paid'), { timeout: 5000 });
    expect(calls).toBe(2);
    // The header badge asked once on load and once more after the payment.
    await waitFor(() => expect(cartReads).toBeGreaterThanOrEqual(2));
  });

  it('tracks purchase once per order, even when the page is opened again', async () => {
    const spy = vi.spyOn(tracking, 'track');
    server.use(statusOf('paid', 'succeeded'), orderOf());
    const first = renderApp(PATH);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'purchase', orderNumber: NUMBER, valueCents: 2689 }),
      ),
    );
    await act(() => first.navigate('/'));
    await act(() => first.navigate(PATH));
    await screen.findByTestId('order-summary');
    expect(spy.mock.calls.filter(([e]) => e.name === 'purchase')).toHaveLength(1);
  });

  it('does not track a purchase for an order that is still pending', async () => {
    const spy = vi.spyOn(tracking, 'track');
    server.use(
      statusOf('pending_payment', 'processing'),
      orderOf(makeOrder({ status: 'pending_payment' })),
    );
    renderApp(PATH);
    await screen.findByTestId('order-summary');
    expect(spy.mock.calls.filter(([e]) => e.name === 'purchase')).toHaveLength(0);
  });

  it('tells the shopper it is still confirming after 30 seconds and promises an email', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(
      statusOf('pending_payment', 'processing'),
      orderOf(makeOrder({ status: 'pending_payment' })),
    );
    renderApp(PATH);
    const status = await screen.findByTestId('confirmation-status');
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'timeout'));
    expect(status).toHaveTextContent('you will get an email');
    expect(status).toHaveTextContent('do not pay again');
  });

  it('"Check again" starts a fresh polling window and finds the late payment', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let paid = false;
    server.use(
      http.get(`${API}/checkout/orders/:number/status`, () =>
        HttpResponse.json({
          data: paid
            ? { status: 'paid', paymentStatus: 'succeeded' }
            : { status: 'pending_payment', paymentStatus: 'processing' },
        }),
      ),
      orderOf(makeOrder({ status: 'pending_payment' })),
    );
    renderApp(PATH);
    const status = await screen.findByTestId('confirmation-status');
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'timeout'));

    paid = true; // the webhook finally arrives
    act(() => screen.getByTestId('confirmation-check-again').click());
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'paid'));
    expect(screen.queryByTestId('confirmation-check-again')).not.toBeInTheDocument();
  });

  it('shows the waking-up copy when the first answer is slow', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(
      http.get(`${API}/checkout/orders/:number/status`, async () => {
        await delay(8_000);
        return HttpResponse.json({ data: { status: 'paid', paymentStatus: 'succeeded' } });
      }),
      orderOf(),
    );
    renderApp(PATH);
    await screen.findByTestId('confirmation-status');
    expect(screen.queryByTestId('confirmation-waking-up')).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(4_500));
    expect(await screen.findByTestId('confirmation-waking-up')).toHaveTextContent('waking up');
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await waitFor(() =>
      expect(screen.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'paid'),
    );
    expect(screen.queryByTestId('confirmation-waking-up')).not.toBeInTheDocument();
  });

  it('offers another try when the payment failed', async () => {
    server.use(
      statusOf('pending_payment', 'failed'),
      orderOf(makeOrder({ status: 'pending_payment' })),
    );
    renderApp(PATH);
    const status = await screen.findByTestId('confirmation-status');
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'failed'));
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/checkout');
  });

  it('says so for a cancelled order', async () => {
    server.use(statusOf('cancelled'), orderOf(makeOrder({ status: 'cancelled' })));
    renderApp(PATH);
    await waitFor(() =>
      expect(screen.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'cancelled'),
    );
  });

  it('shows a not-found state for an order this browser may not see', async () => {
    server.use(
      http.get(`${API}/checkout/orders/:number/status`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Order not found' } },
          { status: 404 },
        ),
      ),
      http.get(`${API}/checkout/orders/:number`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Order not found' } },
          { status: 404 },
        ),
      ),
    );
    renderApp(PATH);
    await waitFor(() =>
      expect(screen.getByTestId('confirmation-status')).toHaveAttribute('data-state', 'not-found'),
    );
    expect(screen.queryByTestId('order-summary')).not.toBeInTheDocument();
  });
});
