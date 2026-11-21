import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeCart } from '../../test/fixtures';
import { renderApp, renderWithProviders } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

import { AddToList } from './AddToList';

const summary = (over: object = {}) => ({
  id: 'l-saved',
  name: 'Saved',
  isDefault: true,
  itemCount: 1,
  ...over,
});
const item = (over: object = {}) => ({
  id: 'i-1',
  productId: 'p-1',
  slug: 'milk',
  name: 'Milk',
  image: null,
  variantId: 'v-1',
  variantName: '1 l',
  priceCents: 129,
  currency: 'EUR',
  available: true,
  quantity: 2,
  ...over,
});
const detail = (over: object = {}) => ({ ...summary(), items: [item()], ...over });

function serveLists(
  lists = [summary(), summary({ id: 'l-party', name: 'Party', isDefault: false })],
) {
  server.use(
    signedInAs(),
    http.get(`${API}/me/lists`, () => HttpResponse.json({ data: lists })),
    http.get(`${API}/me/lists/:id`, ({ params }) =>
      HttpResponse.json({
        data: detail({
          id: String(params.id),
          name: lists.find((l) => l.id === params.id)?.name ?? 'Saved',
          isDefault: params.id === 'l-saved',
        }),
      }),
    ),
  );
}

describe('account lists', () => {
  it('shows "Saved" first with its items and quantities, and a way to add a list', async () => {
    serveLists();
    renderApp('/account/lists');
    expect(await screen.findByRole('button', { name: 'Saved (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const rows = await screen.findByTestId('list-items');
    expect(within(rows).getByText('Milk')).toBeVisible();
    expect(within(rows).getByLabelText('Quantity of Milk')).toHaveValue(2);
    expect(screen.getByLabelText('New list')).toBeVisible();
    // The default list keeps its name and cannot be deleted.
    expect(screen.queryByRole('button', { name: 'Delete list' })).not.toBeInTheDocument();
  });

  it('creates a named list and shows it', async () => {
    let body: unknown;
    serveLists();
    server.use(
      http.post(`${API}/me/lists`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { data: summary({ id: 'l-new', name: 'Weekly shop', isDefault: false, itemCount: 0 }) },
          { status: 201 },
        );
      }),
    );
    renderApp('/account/lists');
    await userEvent.type(await screen.findByLabelText('New list'), 'Weekly shop');
    await userEvent.click(screen.getByRole('button', { name: 'Create list' }));
    await waitFor(() => expect(body).toEqual({ name: 'Weekly shop' }));
  });

  it('says plainly when a name is taken', async () => {
    serveLists();
    server.use(
      http.post(`${API}/me/lists`, () =>
        HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'You already have a list with that name' } },
          { status: 409 },
        ),
      ),
    );
    renderApp('/account/lists');
    await userEvent.type(await screen.findByLabelText('New list'), 'party');
    await userEvent.click(screen.getByRole('button', { name: 'Create list' }));
    expect(await screen.findByText('You already have a list with that name')).toBeVisible();
  });

  it('puts everything in the basket and lists what could not go in', async () => {
    serveLists();
    server.use(
      http.post(`${API}/me/lists/:id/add-to-cart`, () =>
        HttpResponse.json({
          data: {
            cart: makeCart([]),
            added: [{ name: 'Milk', variantName: '1 l', quantity: 2 }],
            skipped: [{ name: 'Cake', variantName: 'Large', reason: 'sold_out' }],
          },
        }),
      ),
    );
    renderApp('/account/lists');
    await userEvent.click(await screen.findByRole('button', { name: 'Add all to basket' }));
    const result = await screen.findByTestId('list-to-cart');
    expect(result).toHaveTextContent('Cake (Large): sold out right now');
  });

  it('changes a quantity and removes an item through the API', async () => {
    const calls: string[] = [];
    serveLists();
    server.use(
      http.patch(`${API}/me/lists/l-saved/items/i-1`, async ({ request }) => {
        calls.push(`patch ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({ data: detail({ items: [item({ quantity: 3 })] }) });
      }),
      http.delete(`${API}/me/lists/l-saved/items/i-1`, () => {
        calls.push('delete');
        return HttpResponse.json({ data: detail({ items: [] }) });
      }),
    );
    renderApp('/account/lists');
    const q = await screen.findByLabelText('Quantity of Milk');
    await userEvent.clear(q);
    await userEvent.type(q, '3{Enter}');
    await waitFor(() => expect(calls.some((c) => c.includes('"quantity":3'))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Milk from the list' }));
    await waitFor(() => expect(calls).toContain('delete'));
  });
});

describe('add to list on a product', () => {
  it('puts the chosen variant on the chosen list', async () => {
    let put: unknown;
    serveLists();
    server.use(
      http.put(`${API}/me/lists/l-party/items`, async ({ request }) => {
        put = await request.json();
        return HttpResponse.json({ data: detail({ id: 'l-party', name: 'Party' }) });
      }),
    );
    renderWithProviders(<AddToList productId="p-1" variantId="v-1" productName="Milk" />);
    await userEvent.selectOptions(await screen.findByLabelText('Add to list'), 'Party');
    await waitFor(() => expect(put).toEqual({ productId: 'p-1', variantId: 'v-1', quantity: 1 }));
  });

  it('renders nothing for a visitor', () => {
    renderWithProviders(<AddToList productId="p-1" variantId="v-1" productName="Milk" />);
    expect(screen.queryByLabelText('Add to list')).not.toBeInTheDocument();
  });
});
