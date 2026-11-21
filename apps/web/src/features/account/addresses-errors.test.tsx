import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeAddress } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

// The failure paths of the addresses page: a list that does not load, and each mutation being
// refused. The happy paths live in account.test.tsx.
const apiError = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });

beforeEach(() => {
  server.use(signedInAs());
});

describe('addresses page failures', () => {
  it('says the list could not load and offers a retry that works', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/account/addresses`, () => {
        calls += 1;
        return calls === 1
          ? apiError(400, 'VALIDATION_ERROR', 'nope')
          : HttpResponse.json({ data: [makeAddress()] });
      }),
    );
    renderApp('/account/addresses');
    expect(await screen.findByText('We could not load your addresses.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('address-card')).toBeInTheDocument();
    expect(screen.queryByText('We could not load your addresses.')).not.toBeInTheDocument();
  });

  it('confirms a new default, and shows the server message when it is refused', async () => {
    let refuse = false;
    server.use(
      http.get(`${API}/account/addresses`, () =>
        HttpResponse.json({ data: [makeAddress({ isDefaultShipping: false })] }),
      ),
      http.patch(`${API}/account/addresses/:id`, () =>
        refuse
          ? apiError(409, 'CONFLICT', 'Address is locked')
          : HttpResponse.json({ data: makeAddress() }),
      ),
    );
    renderApp('/account/addresses');
    const button = await screen.findByRole('button', { name: 'Make default delivery address' });
    await userEvent.click(button);
    expect(await screen.findByText('Default delivery address updated')).toBeInTheDocument();

    refuse = true;
    await userEvent.click(
      await screen.findByRole('button', { name: 'Make default delivery address' }),
    );
    expect(await screen.findByText('Address is locked')).toBeInTheDocument();
  });

  it('keeps the address when the delete is refused or the dialog is dismissed', async () => {
    server.use(
      http.get(`${API}/account/addresses`, () => HttpResponse.json({ data: [makeAddress()] })),
      http.delete(`${API}/account/addresses/:id`, () => apiError(500, 'INTERNAL', 'Server broke')),
    );
    renderApp('/account/addresses');
    await userEvent.click(await screen.findByRole('button', { name: /^Delete/ }));
    await userEvent.click(screen.getByTestId('address-delete-confirm'));
    expect(await screen.findByText('Server broke')).toBeInTheDocument();
    expect(screen.getByTestId('address-card')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.queryByText('Delete this address?')).not.toBeInTheDocument());
    expect(screen.getByTestId('address-card')).toBeInTheDocument();
  });
});
