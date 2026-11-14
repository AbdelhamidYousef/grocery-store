import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeAddress, makeUser } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

beforeEach(() => {
  server.use(signedInAs());
});

function apiError(status: number, code: string, message: string, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

describe('account area', () => {
  it('shows the side nav and marks the current section', async () => {
    renderApp('/account/security');
    const nav = await screen.findByRole('navigation', { name: 'Account' });
    expect(within(nav).getByRole('link', { name: 'Security' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getAllByRole('link')).toHaveLength(7);
  });

  it('saves a changed name and updates the header', async () => {
    let body: unknown;
    server.use(
      http.patch(`${API}/account`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { user: makeUser({ firstName: 'Robin' }) } });
      }),
    );
    renderApp('/account');
    const first = await screen.findByLabelText('First name');
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await userEvent.clear(first);
    await userEvent.type(first, 'Robin');
    await userEvent.click(save);
    await waitFor(() => expect(body).toEqual({ firstName: 'Robin', lastName: 'Rivers' }));
    await waitFor(() => expect(screen.getByTestId('account-name')).toHaveTextContent('Robin'));
    expect(screen.getByText('Profile saved')).toBeInTheDocument();
  });

  it('shows a wrong current password on that field, not as a session problem', async () => {
    server.use(
      http.post(`${API}/account/password`, () =>
        apiError(400, 'VALIDATION_ERROR', 'Invalid input', {
          formErrors: [],
          fieldErrors: { currentPassword: ['Current password is incorrect'] },
        }),
      ),
    );
    const router = renderApp('/account/security');
    await userEvent.type(await screen.findByLabelText('Current password'), 'old-old-old-old');
    await userEvent.type(screen.getByLabelText('New password'), 'a-brand-new-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    const field = screen.getByLabelText('Current password');
    await waitFor(() => expect(field).toHaveAccessibleDescription('Current password is incorrect'));
    expect(field).toHaveFocus();
    expect(router.state.location.pathname).toBe('/account/security');
  });

  it('refuses a new password equal to the current one before calling the API', async () => {
    renderApp('/account/security');
    await userEvent.type(await screen.findByLabelText('Current password'), 'same-same-same-1');
    await userEvent.type(screen.getByLabelText('New password'), 'same-same-same-1');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Choose a password you are not using now')).toBeInTheDocument();
  });

  it('lists addresses with their default badges', async () => {
    server.use(
      http.get(`${API}/account/addresses`, () =>
        HttpResponse.json({
          data: [
            makeAddress(),
            makeAddress({
              id: 'a2',
              label: null,
              line1: '2 Fish Road',
              isDefaultShipping: false,
              isDefaultBilling: false,
            }),
          ],
        }),
      ),
    );
    renderApp('/account/addresses');
    const cards = await screen.findAllByTestId('address-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText('Default shipping')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Default billing')).toBeInTheDocument();
    expect(within(cards[1]!).getByRole('button', { name: 'Make default shipping' })).toBeVisible();
    expect(cards[0]).toHaveTextContent('Germany');
  });

  it('adds an address, sending empty optional fields as null', async () => {
    let body: unknown;
    server.use(
      http.get(`${API}/account/addresses`, () => HttpResponse.json({ data: [] })),
      http.post(`${API}/account/addresses`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: makeAddress() }, { status: 201 });
      }),
    );
    renderApp('/account/addresses');
    expect(await screen.findByText(/no saved addresses/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add address' }));
    await userEvent.click(screen.getByTestId('address-save'));
    // Required fields are reported and the first one has focus.
    expect(await screen.findAllByText('Required')).not.toHaveLength(0);
    expect(screen.getByLabelText('Full name')).toHaveFocus();

    await userEvent.type(screen.getByLabelText('Full name'), 'Sam Rivers');
    await userEvent.type(screen.getByLabelText('Address line 1'), '1 Bone Street');
    await userEvent.type(screen.getByLabelText('Postal code'), '10115');
    await userEvent.type(screen.getByLabelText('City'), 'Berlin');
    await userEvent.click(screen.getByTestId('address-save'));
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({
      fullName: 'Sam Rivers',
      line1: '1 Bone Street',
      line2: null,
      region: null,
      phone: null,
      country: 'DE',
    });
  });

  it('asks before deleting an address and deletes on confirm (204, no body)', async () => {
    let deleted = '';
    server.use(
      http.get(`${API}/account/addresses`, () => HttpResponse.json({ data: [makeAddress()] })),
      http.delete(`${API}/account/addresses/:id`, ({ params }) => {
        deleted = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/account/addresses');
    await userEvent.click(await screen.findByRole('button', { name: /^Delete/ }));
    expect(deleted).toBe('');
    await userEvent.click(screen.getByTestId('address-delete-confirm'));
    await waitFor(() => expect(deleted).toBe('a1'));
  });

  it('shows an empty orders state', async () => {
    server.use(
      http.get(`${API}/account/orders`, () =>
        HttpResponse.json({
          data: [],
          meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
        }),
      ),
    );
    renderApp('/account/orders');
    expect(await screen.findByText('You have not placed an order yet.')).toBeInTheDocument();
  });
});
