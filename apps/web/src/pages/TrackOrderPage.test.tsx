import type { TrackedOrder } from '@store/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { renderApp } from '../test/render';
import { API, server } from '../test/server';

const order: TrackedOrder = {
  orderNumber: 'PW-2026-000007',
  status: 'shipped',
  statusLabel: 'On the way',
  placedAt: '2026-10-01T10:00:00.000Z',
  items: [{ name: 'Rope Tug', variantName: 'Red', quantity: 2 }],
  changes: [],
  tracking: null,
  delivery: null,
  fulfilment: null,
  timeline: [
    { status: 'pending_payment', label: 'Awaiting payment', at: '2026-10-01T10:00:00.000Z' },
    { status: 'paid', label: 'Payment confirmed', at: '2026-10-01T10:01:00.000Z' },
    { status: 'shipped', label: 'On its way', at: '2026-10-02T09:00:00.000Z' },
  ],
};

const withWindow: TrackedOrder = {
  ...order,
  delivery: { kind: 'slot', from: '2026-11-23T13:00:00.000Z', to: '2026-11-23T14:00:00.000Z' },
};

async function fill(number: string, email: string) {
  const user = userEvent.setup();
  await user.clear(await screen.findByLabelText('Order number'));
  await user.type(screen.getByLabelText('Order number'), number);
  await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Track order' }));
}

describe('track order page', () => {
  it('shows the delivery window of the order', async () => {
    server.use(http.post(`${API}/orders/track`, () => HttpResponse.json({ data: withWindow })));
    renderApp('/track-order');
    await fill('PW-2026-000007', 'ada@grocery.test');
    expect(await screen.findByTestId('delivery-order-window')).toHaveTextContent(
      /^Arrives Mon.*23.*Nov 14:00–15:00$/,
    );
  });

  it('shows the status, the progress list and the items', async () => {
    const seen = vi.fn();
    server.use(
      http.post(`${API}/orders/track`, async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json({ data: order });
      }),
    );
    renderApp('/track-order');
    await fill('PW-2026-000007', 'ada@grocery.test');
    expect(await screen.findByTestId('track-status')).toHaveTextContent('On the way');
    const steps = within(screen.getByRole('list', { name: 'Order progress' })).getAllByRole(
      'listitem',
    );
    expect(steps).toHaveLength(3);
    expect(screen.getByText('Rope Tug', { exact: false })).toBeInTheDocument();
    expect(seen).toHaveBeenCalledWith({ orderNumber: 'PW-2026-000007', email: 'ada@grocery.test' });
  });

  it('prefills the order number from the link in the email, never the address', async () => {
    renderApp('/track-order?number=PW-2026-000009');
    expect(await screen.findByLabelText('Order number')).toHaveValue('PW-2026-000009');
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('shows one generic message for a wrong pair', async () => {
    server.use(
      http.post(`${API}/orders/track`, () =>
        HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'x' } }, { status: 404 }),
      ),
    );
    renderApp('/track-order');
    await fill('PW-2026-000007', 'wrong@grocery.test');
    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'could not find an order with that number and email',
    );
    expect(screen.queryByTestId('track-result')).toBeNull();
  });

  it('asks for both fields before calling the server', async () => {
    renderApp('/track-order');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Track order' }));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('Enter your order number');
  });

  it('explains a rate limit', async () => {
    server.use(
      http.post(`${API}/orders/track`, () =>
        HttpResponse.json({ error: { code: 'RATE_LIMITED', message: 'x' } }, { status: 429 }),
      ),
    );
    renderApp('/track-order');
    await fill('PW-2026-000007', 'ada@grocery.test');
    expect(await screen.findByTestId('form-error')).toHaveTextContent('Too many tries');
  });
});

describe('the rider on the tracking page', () => {
  const dispatchedAt = new Date(Date.now() - 18 * 60_000).toISOString();
  const onTheWay: TrackedOrder = {
    ...order,
    delivery: {
      kind: 'slot',
      from: new Date(Date.now() + 10 * 60_000).toISOString(),
      to: new Date(Date.now() + 70 * 60_000).toISOString(),
    },
    fulfilment: { riderName: 'Mara', packedAt: dispatchedAt, dispatchedAt, deliveredAt: null },
  };

  it('shows the four grocery steps with the current one marked', async () => {
    server.use(http.post(`${API}/orders/track`, () => HttpResponse.json({ data: onTheWay })));
    renderApp('/track-order');
    await fill('PW-2026-000007', 'ada@grocery.test');
    const steps = within(await screen.findByRole('list', { name: 'Delivery steps' })).getAllByRole(
      'listitem',
    );
    expect(steps.map((s) => s.textContent)).toEqual([
      'Order received',
      'Being packed',
      'On the way',
      'Delivered',
    ]);
    expect(steps[2]).toHaveAttribute('aria-current', 'step');
  });

  it('names the rider, shows a simulated progress bar and the minutes left, and says it is a demo', async () => {
    server.use(http.post(`${API}/orders/track`, () => HttpResponse.json({ data: onTheWay })));
    renderApp('/track-order');
    await fill('PW-2026-000007', 'ada@grocery.test');
    const card = await screen.findByTestId('track-rider');
    expect(card).toHaveTextContent('Mara is on the way');
    // 18 of 30 minutes ridden.
    expect(within(card).getByRole('progressbar', { name: 'Rider progress' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
    expect(screen.getByTestId('track-rider-eta')).toHaveTextContent('About 12 minutes away');
    expect(card).toHaveTextContent('the rider is simulated');
  });

  it('speaks German with "du" in the de-de store view', async () => {
    server.use(http.post(`${API}/orders/track`, () => HttpResponse.json({ data: onTheWay })));
    renderApp('/de-de/track-order');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Bestellnummer'), 'PW-2026-000007');
    await user.type(screen.getByLabelText('E-Mail'), 'ada@grocery.test');
    await user.click(screen.getByRole('button', { name: /verfolgen/i }));
    const card = await screen.findByTestId('track-rider');
    expect(card).toHaveTextContent('Mara ist unterwegs');
    expect(screen.getByTestId('track-rider-eta')).toHaveTextContent('Noch etwa 12 Minuten');
    expect(card).toHaveTextContent('Der Fahrer ist simuliert');
    expect(
      within(screen.getByRole('list', { name: 'Lieferschritte' })).getAllByRole('listitem')[0],
    ).toHaveTextContent('Bestellung erhalten');
  });

  it('shows no rider before the hand-over and none once delivered', async () => {
    server.use(
      http.post(`${API}/orders/track`, () =>
        HttpResponse.json({ data: { ...order, status: 'processing' } }),
      ),
    );
    renderApp('/track-order');
    await fill('PW-2026-000007', 'ada@grocery.test');
    await screen.findByTestId('track-status');
    expect(screen.queryByTestId('track-rider')).not.toBeInTheDocument();
  });

  it('asks again every 30 seconds while on the way and shows the new state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let calls = 0;
      server.use(
        http.post(`${API}/orders/track`, () => {
          calls += 1;
          return HttpResponse.json({
            data: calls === 1 ? onTheWay : { ...onTheWay, status: 'delivered' },
          });
        }),
      );
      renderApp('/track-order');
      await fill('PW-2026-000007', 'ada@grocery.test');
      expect(await screen.findByTestId('track-rider')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(31_000);
      await waitFor(() => expect(calls).toBe(2));
      await waitFor(() =>
        expect(screen.getByTestId('track-status')).toHaveTextContent('Delivered'),
      );
      expect(screen.queryByTestId('track-rider')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
