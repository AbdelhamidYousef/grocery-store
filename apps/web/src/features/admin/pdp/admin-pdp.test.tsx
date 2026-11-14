import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeAdminProduct, makeAdminRow } from '../../../test/fixtures';
import { renderApp } from '../../../test/render';
import { API, server, signedInAs } from '../../../test/server';

beforeEach(() => {
  server.use(
    signedInAs({ role: 'admin' }),
    http.get(`${API}/admin/products/p1`, () => HttpResponse.json({ data: makeAdminProduct() })),
    http.get(`${API}/admin/brands`, () => HttpResponse.json({ data: [] })),
    http.get(`${API}/admin/tags`, () => HttpResponse.json({ data: [] })),
  );
});

const content = (over: Record<string, unknown> = {}) => ({
  specs: [{ label: 'Origin', value: 'Nowhere' }],
  faqs: [{ id: 'f1', question: 'Is it washable?', answer: 'Yes.' }],
  constituents: [
    { variantId: 'v1', values: [{ key: 'protein', valueBp: 2650 }] },
    { variantId: 'v2', values: [] },
  ],
  deliveryNote: null,
  relations: [],
  ...over,
});

async function openContent(data = content()) {
  let saved: unknown;
  server.use(
    http.get(`${API}/admin/products/p1/content`, () => HttpResponse.json({ data })),
    http.put(`${API}/admin/products/p1/content`, async ({ request }) => {
      saved = await request.json();
      return HttpResponse.json({ data });
    }),
  );
  renderApp('/admin/products/p1');
  const section = await screen.findByTestId('product-content');
  return { section, saved: () => saved };
}

describe('product content editor', () => {
  it('shows the stored specs, then switches tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    const { section } = await openContent();
    expect(await within(section).findByLabelText('Spec 1 label')).toHaveValue('Origin');
    const tabs = within(section).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Specs',
      'Constituents',
      'FAQ',
      'Recommendations',
      'Delivery',
    ]);
    tabs[0]?.focus();
    await user.keyboard('{ArrowRight}');
    expect(within(section).getAllByLabelText(/Red.* protein \(%\)/i)[0]).toHaveValue('26.5');
  });

  it('adds, reorders and removes FAQ rows with named buttons', async () => {
    const user = userEvent.setup();
    const { section } = await openContent();
    await user.click(within(section).getByRole('tab', { name: 'FAQ' }));
    await user.click(within(section).getByRole('button', { name: 'Add a question' }));
    await user.type(within(section).getByLabelText('Question 2'), 'Second?');
    await user.type(within(section).getByLabelText('Answer 2'), 'Yes.');
    await user.click(within(section).getByRole('button', { name: 'Move question 2 up' }));
    expect(within(section).getByLabelText('Question 1')).toHaveValue('Second?');
    expect(within(section).getByRole('button', { name: 'Move question 1 up' })).toBeDisabled();
    await user.click(within(section).getByRole('button', { name: 'Remove question 1' }));
    expect(within(section).queryByLabelText('Question 2')).toBeNull();
  });

  it('saves percent as basis points', async () => {
    const user = userEvent.setup();
    const { section, saved } = await openContent();
    await user.click(within(section).getByRole('button', { name: 'Save page content' }));
    await waitFor(() => expect(saved()).toBeTruthy());
    const body = saved() as {
      constituents: { values: { key: string; valueBp: number }[] }[];
    };
    expect(body.constituents[0]?.values).toEqual([{ key: 'protein', valueBp: 2650 }]);
  });

  it('shows the server sentence when the save is refused', async () => {
    const user = userEvent.setup();
    const { section } = await openContent();
    server.use(
      http.put(`${API}/admin/products/p1/content`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: {
                formErrors: [],
                fieldErrors: { deliveryNote: ['Keep the note short'] },
              },
            },
          },
          { status: 400 },
        ),
      ),
    );
    await user.click(within(section).getByRole('button', { name: 'Save page content' }));
    expect(await screen.findByText(/Keep the note short/)).toBeInTheDocument();
  });
});

describe('recommendations editor', () => {
  it('adds a searched product to a list, once, and saves ids in list order', async () => {
    const user = userEvent.setup();
    let saved: { relations?: { relatedId: string; kind: string }[] } = {};
    server.use(
      http.get(`${API}/admin/products/p1/content`, () =>
        HttpResponse.json({
          data: content({
            relations: [{ relatedId: 'p9', relatedName: 'Old pick', kind: 'related' }],
          }),
        }),
      ),
      http.get(`${API}/admin/products`, ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        return HttpResponse.json({
          data: q ? [makeAdminRow({ id: 'p2', name: 'Chew Ball' })] : [],
          meta: { page: 1, limit: 6, total: 1, totalPages: 1 },
        });
      }),
      http.put(`${API}/admin/products/p1/content`, async ({ request }) => {
        saved = (await request.json()) as typeof saved;
        return HttpResponse.json({ data: content() });
      }),
    );
    renderApp('/admin/products/p1');
    const section = await screen.findByTestId('product-content');
    await user.click(within(section).getByRole('tab', { name: 'Recommendations' }));
    expect(within(section).getByText('Old pick')).toBeInTheDocument();
    await user.type(
      within(section).getByLabelText('Find a product for Frequently bought together'),
      'chew',
    );
    await user.click(
      await within(section).findByRole('button', {
        name: /Add Chew Ball to Frequently bought together/,
      }),
    );
    expect(within(section).getByText('Chew Ball')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Save page content' }));
    await waitFor(() => expect(saved.relations).toBeTruthy());
    expect(saved.relations).toEqual([
      { relatedId: 'p9', kind: 'related' },
      { relatedId: 'p2', kind: 'bought_together' },
    ]);
  });
});
