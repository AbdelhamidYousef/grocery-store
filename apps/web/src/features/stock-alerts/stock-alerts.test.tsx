import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeVariant } from '../../test/fixtures';
import { renderApp, renderWithProviders } from '../../test/render';
import { API, server } from '../../test/server';
import { AddToCart } from '../catalog/AddToCart';

describe('back-in-stock alert', () => {
  it('is offered on a sold-out variant, not on one in stock', () => {
    renderWithProviders(<AddToCart variant={makeVariant({ available: true })} />);
    expect(screen.queryByTestId('stock-alert-form')).toBeNull();
  });

  it('sends the variant and email, then confirms', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/stock-alerts`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { status: 'waiting' } }, { status: 201 });
      }),
    );
    const variant = makeVariant({ available: false });
    renderWithProviders(<AddToCart variant={variant} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Email me when back' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'pat@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me when back' }));
    expect(await screen.findByTestId('stock-alert-done')).toHaveTextContent('pat@example.com');
    expect(bodies).toEqual([{ variantId: variant.id, email: 'pat@example.com' }]);
  });

  it('cancels from the link in the email', async () => {
    server.use(
      http.delete(`${API}/stock-alerts/:token`, () => new HttpResponse(null, { status: 204 })),
    );
    renderApp('/stock-alerts/cancel?token=' + 'c'.repeat(24));
    expect(await screen.findByText(/we will not email you about that item/)).toBeInTheDocument();
  });
});
