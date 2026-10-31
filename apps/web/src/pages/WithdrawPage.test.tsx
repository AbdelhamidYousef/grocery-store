import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { renderApp } from '../test/render';
import { API, server } from '../test/server';

async function fill(email = 'ada@pawsome.test') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Order number'), 'PW-2026-000007');
  await user.type(screen.getByLabelText('Email used for the order'), email);
  await user.type(screen.getByLabelText('Reason (optional)'), 'Changed my mind');
  await user.click(screen.getByRole('button', { name: 'Withdraw from contract' }));
}

describe('withdraw page', () => {
  it('submits the form and shows the reference and time received', async () => {
    const seen = vi.fn();
    server.use(
      http.post(`${API}/withdrawals`, async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json(
          {
            data: {
              reference: 'WD-ABCD1234',
              orderNumber: 'PW-2026-000007',
              requestedAt: '2026-10-31T12:00:00.000Z',
            },
          },
          { status: 201 },
        );
      }),
    );
    renderApp('/withdraw');
    await fill();
    expect(await screen.findByTestId('withdraw-success')).toHaveTextContent('WD-ABCD1234');
    expect(screen.getByTestId('withdraw-success')).toHaveTextContent('31 October 2026');
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: 'PW-2026-000007', reason: 'Changed my mind' }),
    );
  });

  it('shows one generic message for a wrong pair', async () => {
    server.use(
      http.post(`${API}/withdrawals`, () =>
        HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'x' } }, { status: 404 }),
      ),
    );
    renderApp('/withdraw');
    await fill('wrong@pawsome.test');
    expect(await screen.findByTestId('form-error')).toHaveTextContent('could not find an order');
  });

  it('prefills the order number from the account link and asks for both fields', async () => {
    const user = userEvent.setup();
    renderApp('/withdraw?number=PW-2026-000009');
    expect(await screen.findByLabelText('Order number')).toHaveValue('PW-2026-000009');
    await user.click(screen.getByRole('button', { name: 'Withdraw from contract' }));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('Enter your order number');
  });
});
