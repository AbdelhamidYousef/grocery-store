import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeCart, makeCartItem } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

const yoghurt = makeCartItem({
  id: 'l1',
  variantId: 'v1',
  productName: 'Greek yoghurt',
  productSlug: 'greek-yoghurt',
});

const options = [
  {
    variantId: 'v9',
    productSlug: 'natural-yoghurt',
    productName: 'Natural yoghurt',
    variantName: '500 g',
    imageUrl: null,
    imageAlt: null,
    unitPriceCents: 210,
  },
];

describe('"if it is missing" on a cart line', () => {
  it('saves a refund choice at once', async () => {
    let body: unknown;
    server.use(
      http.get(`${API}/cart`, () => HttpResponse.json({ data: makeCart([yoghurt]) })),
      http.put(`${API}/cart/items/l1/substitution`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: makeCart([{ ...yoghurt, substitution: 'none' }]),
        });
      }),
    );
    renderApp('/cart');
    const select = await screen.findByRole('combobox', { name: 'If it is missing' });
    expect(select).toHaveValue('best_match');
    await userEvent.selectOptions(select, 'none');
    await waitFor(() => expect(body).toEqual({ substitution: 'none' }));
    expect(await screen.findByText('We leave it out and do not charge you for it.')).toBeVisible();
  });

  it('lets the shopper choose from the best-match list', async () => {
    let body: unknown;
    server.use(
      http.get(`${API}/cart`, () => HttpResponse.json({ data: makeCart([yoghurt]) })),
      http.get(`${API}/products/greek-yoghurt/substitutes`, () =>
        HttpResponse.json({ data: options }),
      ),
      http.put(`${API}/cart/items/l1/substitution`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: makeCart([
            {
              ...yoghurt,
              substitution: 'specific',
              substitute: { variantId: 'v9', productName: 'Natural yoghurt', variantName: '500 g' },
            },
          ]),
        });
      }),
    );
    renderApp('/cart');
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'If it is missing' }),
      'specific',
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('Natural yoghurt')[0]).toBeVisible();
    await userEvent.click(within(dialog).getByTestId('substitution-pick'));
    await waitFor(() =>
      expect(body).toEqual({ substitution: 'specific', substituteVariantId: 'v9' }),
    );
    expect(await screen.findByTestId('substitution-chosen')).toHaveTextContent(
      'Instead: Natural yoghurt.',
    );
  });

  it('says so when nothing safe is in stock', async () => {
    server.use(
      http.get(`${API}/cart`, () => HttpResponse.json({ data: makeCart([yoghurt]) })),
      http.get(`${API}/products/greek-yoghurt/substitutes`, () => HttpResponse.json({ data: [] })),
    );
    renderApp('/cart');
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'If it is missing' }),
      'specific',
    );
    expect(await screen.findByTestId('substitution-none')).toHaveTextContent(
      'Nothing safe is in stock right now.',
    );
  });

  it('applies one choice to every line', async () => {
    let body: unknown;
    server.use(
      http.get(`${API}/cart`, () => HttpResponse.json({ data: makeCart([yoghurt]) })),
      http.put(`${API}/cart/substitution`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: makeCart([{ ...yoghurt, substitution: 'none' }]) });
      }),
    );
    renderApp('/cart');
    const all = await screen.findByTestId('substitution-all');
    await userEvent.click(within(all).getByRole('button', { name: 'Refund it' }));
    await waitFor(() => expect(body).toEqual({ substitution: 'none' }));
  });
});

describe('the account default', () => {
  it('shows the saved choice and saves a new one', async () => {
    let body: unknown;
    server.use(
      signedInAs(),
      http.get(`${API}/account/substitution`, () =>
        HttpResponse.json({ data: { defaultSubstitution: 'best_match' } }),
      ),
      http.put(`${API}/account/substitution`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { defaultSubstitution: 'none' } });
      }),
    );
    renderApp('/account');
    const section = await screen.findByTestId('substitution-default');
    const select = within(section).getByRole('combobox');
    await waitFor(() => expect(select).toHaveValue('best_match'));
    const save = within(section).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.selectOptions(select, 'none');
    await userEvent.click(save);
    await waitFor(() => expect(body).toEqual({ defaultSubstitution: 'none' }));
  });
});
