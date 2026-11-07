import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '../../../test/render';
import { API, server, signedInAs } from '../../../test/server';

beforeEach(() => {
  server.use(signedInAs({ role: 'admin' }));
});

const code = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  code: 'PAWS10',
  kind: 'percent',
  value: 10,
  minSpendCents: 3000,
  startsAt: null,
  endsAt: null,
  maxUses: 100,
  perCustomerMax: null,
  excludeSaleItems: false,
  firstOrderOnly: false,
  active: true,
  archivedAt: null,
  liveRedemptions: 5,
  createdAt: '2026-11-01T10:00:00.000Z',
  ...over,
});

describe('promotions navigation', () => {
  it('adds one Promotions item to the admin nav, with Codes, Bulk tiers and Gift tabs inside', async () => {
    server.use(http.get(`${API}/admin/discount-codes`, () => HttpResponse.json({ data: [] })));
    renderApp('/admin/promotions');
    const nav = await screen.findByTestId('admin-nav');
    expect(within(nav).getAllByRole('link', { name: /promotions/i })).toHaveLength(1);
    const tabs = await screen.findByTestId('promotions-tabs');
    for (const name of ['Codes', 'Bulk tiers', 'Gift'])
      expect(within(tabs).getByRole('link', { name })).toBeInTheDocument();
    // The index redirects to the codes tab.
    expect(await screen.findByTestId('admin-codes')).toBeInTheDocument();
  });
});

describe('discount codes screen', () => {
  it('lists codes with the same sentence the form previews', async () => {
    server.use(
      http.get(`${API}/admin/discount-codes`, () =>
        HttpResponse.json({
          data: [
            code(),
            code({
              id: 'c2',
              code: 'WELCOME5',
              kind: 'fixed',
              value: 500,
              minSpendCents: 0,
              maxUses: null,
              firstOrderOnly: true,
              liveRedemptions: 0,
            }),
            code({ id: 'c3', code: 'OLD', archivedAt: '2026-11-02T00:00:00.000Z', active: false }),
          ],
        }),
      ),
    );
    renderApp('/admin/promotions/codes');
    const rows = await screen.findAllByTestId('admin-code-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('10% off, min €30.00, 5 of 100 used');
    expect(rows[1]).toHaveTextContent('€5.00 off, first order only');
    expect(rows[2]).toHaveTextContent('Archived');
    // An archived code cannot be deleted again.
    expect(within(rows[2]!).queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('previews live while typing, and sends euros as integer cents', async () => {
    let posted: unknown;
    server.use(
      http.get(`${API}/admin/discount-codes`, () => HttpResponse.json({ data: [] })),
      http.post(`${API}/admin/discount-codes`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ data: code() }, { status: 201 });
      }),
    );
    renderApp('/admin/promotions/codes');
    await userEvent.click(await screen.findByRole('button', { name: 'New code' }));
    const form = await screen.findByTestId('admin-code-form');
    const preview = within(form).getByTestId('code-preview');
    expect(preview).toHaveTextContent('Fill in the amount');

    await userEvent.type(within(form).getByLabelText('Code'), 'SPRING10');
    await userEvent.selectOptions(within(form).getByLabelText('Type'), 'fixed');
    await userEvent.type(within(form).getByLabelText('Amount off (EUR)'), '5,5');
    await userEvent.type(within(form).getByLabelText('Minimum spend (EUR)'), '19.99');
    await waitFor(() => expect(preview).toHaveTextContent('€5.50 off, min €19.99'));
    await userEvent.click(within(form).getByLabelText('First order only'));
    expect(preview).toHaveTextContent('€5.50 off, min €19.99, first order only');

    await userEvent.click(within(form).getByRole('button', { name: 'Create code' }));
    await waitFor(() =>
      expect(posted).toMatchObject({
        code: 'SPRING10',
        kind: 'fixed',
        value: 550,
        minSpendCents: 1999,
        maxUses: null,
        firstOrderOnly: true,
      }),
    );
  });

  it('refuses bad input before sending, with errors tied to their fields', async () => {
    let posts = 0;
    server.use(
      http.get(`${API}/admin/discount-codes`, () => HttpResponse.json({ data: [] })),
      http.post(`${API}/admin/discount-codes`, () => {
        posts += 1;
        return HttpResponse.json({ data: code() }, { status: 201 });
      }),
    );
    renderApp('/admin/promotions/codes');
    await userEvent.click(await screen.findByRole('button', { name: 'New code' }));
    const form = await screen.findByTestId('admin-code-form');
    await userEvent.type(within(form).getByLabelText('Code'), 'X');
    await userEvent.type(within(form).getByLabelText('Percentage'), '101');
    await userEvent.click(within(form).getByRole('button', { name: 'Create code' }));
    const percent = within(form).getByLabelText('Percentage');
    expect(percent).toHaveAttribute('aria-invalid', 'true');
    const describedBy = percent.getAttribute('aria-describedby') ?? '';
    expect(
      describedBy
        .split(' ')
        .some((id) => document.getElementById(id)?.textContent?.includes('1 to 100')),
    ).toBe(true);
    expect(within(form).getByLabelText('Code')).toHaveAttribute('aria-invalid', 'true');
    expect(posts).toBe(0);
  });

  it('shows the duplicate-code 409 sentence in the form', async () => {
    server.use(
      http.get(`${API}/admin/discount-codes`, () => HttpResponse.json({ data: [] })),
      http.post(`${API}/admin/discount-codes`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'A code with that name already exists (codes are not case-sensitive).',
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderApp('/admin/promotions/codes');
    await userEvent.click(await screen.findByRole('button', { name: 'New code' }));
    const form = await screen.findByTestId('admin-code-form');
    await userEvent.type(within(form).getByLabelText('Code'), 'paws10');
    await userEvent.type(within(form).getByLabelText('Percentage'), '10');
    await userEvent.click(within(form).getByRole('button', { name: 'Create code' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('already exists');
  });
});

describe('bulk tiers screen', () => {
  it('lists tiers and creates one from euros', async () => {
    let posted: unknown;
    server.use(
      http.get(`${API}/admin/bulk-tiers`, () =>
        HttpResponse.json({ data: [{ id: 't1', minCents: 7500, percent: 5, active: true }] }),
      ),
      http.post(`${API}/admin/bulk-tiers`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          { data: { id: 't2', minCents: 10000, percent: 10, active: true } },
          { status: 201 },
        );
      }),
    );
    renderApp('/admin/promotions/tiers');
    const rows = await screen.findAllByTestId('admin-tier-row');
    expect(rows[0]).toHaveTextContent('€75.00');
    expect(rows[0]).toHaveTextContent('5% off');
    await userEvent.click(screen.getByRole('button', { name: 'New tier' }));
    const form = await screen.findByTestId('admin-tier-form');
    await userEvent.type(within(form).getByLabelText('Spend from (EUR)'), '100');
    await userEvent.type(within(form).getByLabelText('Percentage off'), '10');
    await userEvent.click(within(form).getByRole('button', { name: 'Create tier' }));
    await waitFor(() => expect(posted).toEqual({ minCents: 10000, percent: 10, active: true }));
  });

  it('shows the overlapping-threshold 409', async () => {
    server.use(
      http.get(`${API}/admin/bulk-tiers`, () => HttpResponse.json({ data: [] })),
      http.post(`${API}/admin/bulk-tiers`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'There is already a tier for that spend. Edit it instead.',
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderApp('/admin/promotions/tiers');
    await userEvent.click(await screen.findByRole('button', { name: 'New tier' }));
    const form = await screen.findByTestId('admin-tier-form');
    await userEvent.type(within(form).getByLabelText('Spend from (EUR)'), '75');
    await userEvent.type(within(form).getByLabelText('Percentage off'), '5');
    await userEvent.click(within(form).getByRole('button', { name: 'Create tier' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('already a tier');
  });
});

describe('gift screen', () => {
  it('shows the active rule and switches it off', async () => {
    let cleared = false;
    server.use(
      http.get(`${API}/admin/gift-rule`, () =>
        HttpResponse.json({
          data: cleared
            ? null
            : {
                id: 'g1',
                thresholdCents: 4000,
                variantId: 'v1',
                sku: 'BISC-1',
                productName: 'Peanut Crunch Biscuits',
                variantName: '200 g',
              },
        }),
      ),
      http.delete(`${API}/admin/gift-rule`, () => {
        cleared = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/admin/promotions/gift');
    expect(await screen.findByTestId('gift-status')).toHaveTextContent(
      'a free Peanut Crunch Biscuits (200 g, BISC-1) from €40.00',
    );
    expect(screen.getByLabelText('Spend from (EUR)')).toHaveValue('40.00');
    await userEvent.click(screen.getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(screen.getByTestId('gift-status')).toHaveTextContent('Off'));
  });

  it('sends the threshold in cents and the SKU, and shows the server refusal for a bad variant', async () => {
    let put: unknown;
    server.use(
      http.get(`${API}/admin/gift-rule`, () => HttpResponse.json({ data: null })),
      http.put(`${API}/admin/gift-rule`, async ({ request }) => {
        put = await request.json();
        return HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: {
                formErrors: [],
                fieldErrors: { variant: ['No variant has that SKU or id'] },
              },
            },
          },
          { status: 400 },
        );
      }),
    );
    renderApp('/admin/promotions/gift');
    await userEvent.type(await screen.findByLabelText('Spend from (EUR)'), '40');
    await userEvent.type(screen.getByLabelText('Gift variant SKU'), 'NOPE');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on gift' }));
    // Scoped to the form: a role query over the whole app page is slow.
    expect(
      await within(screen.getByTestId('admin-gift-form')).findByTestId('form-error'),
    ).toHaveTextContent('No variant has that SKU');
    expect(put).toEqual({ thresholdCents: 4000, variant: 'NOPE' });
  });
});
