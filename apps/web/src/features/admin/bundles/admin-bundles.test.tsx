import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '../../../test/render';
import { API, server, signedInAs } from '../../../test/server';

const kit = {
  variantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  productId: 'p9',
  slug: 'play-kit',
  name: 'Play Kit',
  priceCents: 2200,
  components: [
    {
      variantId: '11111111-1111-4111-8111-111111111111',
      productSlug: 'rope',
      productName: 'Rope',
      variantName: 'Red',
      sku: 'ROPE-R',
      qty: 2,
      priceCents: 1000,
      available: 9,
    },
    {
      variantId: '22222222-2222-4222-8222-222222222222',
      productSlug: 'ball',
      productName: 'Ball',
      variantName: 'Blue',
      sku: 'BALL-B',
      qty: 1,
      priceCents: 500,
      available: 10,
    },
  ],
  individualCents: 2500,
  savingCents: 300,
  available: 4,
};

beforeEach(() => {
  server.use(
    signedInAs({ role: 'admin' }),
    http.get(`${API}/admin/bundles`, () => HttpResponse.json({ data: [kit] })),
    http.get(`${API}/admin/bundles/variants`, () =>
      HttpResponse.json({
        data: [
          {
            variantId: '33333333-3333-4333-8333-333333333333',
            label: 'Bone (Large)',
            sku: 'BONE-L',
            priceCents: 700,
          },
        ],
      }),
    ),
  );
});

describe('kits screen', () => {
  it('lists the kits with their saving and what can be made', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    await user.click(
      within(await screen.findByTestId('admin-nav')).getByRole('link', { name: 'Kits' }),
    );
    const row = await screen.findByTestId('admin-bundle-row');
    expect(row).toHaveTextContent('Play Kit');
    expect(row).toHaveTextContent('2 parts');
    expect(row).toHaveTextContent('saves €3.00');
    expect(row).toHaveTextContent('4 can be made');
  });

  it('previews the saving live and warns when the price is not below the parts', async () => {
    const user = userEvent.setup();
    renderApp('/admin/bundles');
    await user.click(await screen.findByRole('button', { name: /Edit/ }));
    const preview = await screen.findByTestId('bundle-preview');
    expect(preview).toHaveTextContent('Parts cost €25.00 separately. The kit saves €3.00.');
    const price = screen.getByLabelText('Kit price (EUR)');
    await user.clear(price);
    await user.type(price, '25');
    expect(preview).toHaveTextContent('The kit price must be lower than that.');
  });

  it('saves a changed price and parts with integer cents', async () => {
    const user = userEvent.setup();
    let sent: unknown;
    server.use(
      http.patch(
        `${API}/admin/bundles/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
        async ({ request }) => {
          sent = await request.json();
          return HttpResponse.json({ data: kit });
        },
      ),
    );
    renderApp('/admin/bundles');
    await user.click(await screen.findByRole('button', { name: /Edit/ }));
    const price = await screen.findByLabelText('Kit price (EUR)');
    await user.clear(price);
    await user.type(price, '19.99');
    await user.selectOptions(
      screen.getByLabelText('Add a part'),
      '33333333-3333-4333-8333-333333333333',
    );
    await user.click(screen.getByRole('button', { name: 'Save kit' }));
    await waitFor(() => expect(sent).toBeTruthy());
    expect(sent).toEqual({
      priceCents: 1999,
      components: [
        { variantId: '11111111-1111-4111-8111-111111111111', qty: 2 },
        { variantId: '22222222-2222-4222-8222-222222222222', qty: 1 },
        { variantId: '33333333-3333-4333-8333-333333333333', qty: 1 },
      ],
    });
  });

  it('shows a server refusal in the form', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch(`${API}/admin/bundles/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: {
                fieldErrors: { priceCents: ['The kit price must be lower than its parts'] },
              },
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderApp('/admin/bundles');
    await user.click(await screen.findByRole('button', { name: /Edit/ }));
    await user.click(await screen.findByRole('button', { name: 'Save kit' }));
    expect(await screen.findByText(/lower than its parts/)).toBeInTheDocument();
  });
});
