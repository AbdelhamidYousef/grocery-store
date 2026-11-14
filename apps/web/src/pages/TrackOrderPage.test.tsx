import type { TrackedOrder } from '@store/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { renderApp } from '../test/render';
import { API, server } from '../test/server';

const order: TrackedOrder = {
  orderNumber: 'PW-2026-000007',
  status: 'shipped',
  statusLabel: 'On its way',
  placedAt: '2026-10-01T10:00:00.000Z',
  items: [{ name: 'Rope Tug', variantName: 'Red', quantity: 2 }],
  tracking: null,
  timeline: [
    { status: 'pending_payment', label: 'Awaiting payment', at: '2026-10-01T10:00:00.000Z' },
    { status: 'paid', label: 'Payment confirmed', at: '2026-10-01T10:01:00.000Z' },
    { status: 'shipped', label: 'On its way', at: '2026-10-02T09:00:00.000Z' },
  ],
};

async function fill(number: string, email: string) {
  const user = userEvent.setup();
  await user.clear(await screen.findByLabelText('Order number'));
  await user.type(screen.getByLabelText('Order number'), number);
  await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Track order' }));
}

describe('track order page', () => {
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
    expect(await screen.findByTestId('track-status')).toHaveTextContent('On its way');
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
