import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CATEGORY_UUID,
  MITTE_STORE_ID,
  makeAdminProduct,
  makeAdminRow,
  makeAdminVariant,
  makeCategory,
} from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

const meta = (total: number, page = 1, totalPages = 1) => ({ page, limit: 20, total, totalPages });

beforeEach(() => {
  server.use(
    signedInAs({ role: 'admin' }),
    http.get(`${API}/categories`, () =>
      HttpResponse.json({
        data: [
          makeCategory({
            id: 'parent',
            name: 'Dairy & eggs',
            children: [makeCategory({ id: CATEGORY_UUID, slug: 'cheese', name: 'Dog toys' })],
          }),
        ],
      }),
    ),
  );
});

function apiError(status: number, code: string, message: string, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

describe('admin product list', () => {
  it('shows rows with price range, status and a sold-out badge', async () => {
    server.use(
      http.get(`${API}/admin/products`, () =>
        HttpResponse.json({
          data: [makeAdminRow(), makeAdminRow({ id: 'p2', name: 'Ball', availableStock: 0 })],
          meta: meta(2),
        }),
      ),
    );
    renderApp('/admin/products');
    const rows = await screen.findAllByTestId('admin-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Rope Tug');
    expect(rows[0]).toHaveTextContent('10.99');
    expect(rows[0]).toHaveTextContent('18.99');
    expect(within(rows[1]!).getByText('Sold out')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rope Tug' })).toHaveAttribute(
      'href',
      '/admin/products/p1',
    );
  });

  it('keeps a very long name inside its cell and the table inside a scroll box', async () => {
    const longName = 'Extra Long Name '.repeat(10).trim();
    server.use(
      http.get(`${API}/admin/products`, () =>
        HttpResponse.json({ data: [makeAdminRow({ name: longName })], meta: meta(1) }),
      ),
    );
    renderApp('/admin/products');
    const link = await screen.findByRole('link', { name: longName });
    expect(link.className).toContain('line-clamp-2');
    expect(link.className).toContain('break-words');
    expect(screen.getByTestId('admin-table').className).toContain('overflow-x-auto');
  });

  it('sends search, status and page from the URL to the API', async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${API}/admin/products`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ data: [makeAdminRow()], meta: meta(45, 2, 3) });
      }),
    );
    renderApp('/admin/products?q=tug&status=draft&page=2');
    await screen.findAllByTestId('admin-row');
    const params = new URLSearchParams(seen[0]);
    expect(params.get('q')).toBe('tug');
    expect(params.get('status')).toBe('draft');
    expect(params.get('page')).toBe('2');
    // Pagination links keep the filters.
    const next = screen.getByRole('link', { name: /Next/ });
    expect(next.getAttribute('href')).toContain('q=tug');
    expect(next.getAttribute('href')).toContain('page=3');
  });

  it('writes a search and a status filter into the URL and resets to page 1', async () => {
    server.use(
      http.get(`${API}/admin/products`, () =>
        HttpResponse.json({ data: [makeAdminRow()], meta: meta(45, 2, 3) }),
      ),
    );
    const router = renderApp('/admin/products?page=2');
    await screen.findAllByTestId('admin-row');
    await userEvent.type(screen.getByRole('searchbox', { name: /Find products/ }), 'duck{Enter}');
    await waitFor(() => expect(router.state.location.search).toBe('?q=duck'));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'archived');
    await waitFor(() => expect(router.state.location.search).toBe('?q=duck&status=archived'));
  });

  it('explains an empty result and offers to clear the filter', async () => {
    server.use(
      http.get(`${API}/admin/products`, () => HttpResponse.json({ data: [], meta: meta(0, 1, 0) })),
    );
    renderApp('/admin/products?q=zzz');
    const empty = await screen.findByTestId('admin-empty');
    expect(empty).toHaveTextContent('No products match this search.');
    expect(
      within(empty).getByRole('link', { name: 'Clear search and filters' }),
    ).toBeInTheDocument();
  });

  it('offers to create the first product when there are none', async () => {
    server.use(
      http.get(`${API}/admin/products`, () => HttpResponse.json({ data: [], meta: meta(0, 1, 0) })),
    );
    renderApp('/admin/products');
    expect(
      await screen.findByRole('link', { name: 'Create the first product' }),
    ).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    server.use(http.get(`${API}/admin/products`, () => apiError(400, 'INTERNAL', 'boom')));
    renderApp('/admin/products');
    expect(await screen.findByText('We could not load the products.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('admin product create', () => {
  async function fillValidProduct() {
    await userEvent.type(await screen.findByLabelText('Name'), 'Squeaky Duck');
    await userEvent.type(screen.getByLabelText('Description'), 'Squeaks loudly.');
    await userEvent.selectOptions(screen.getByLabelText('Category'), CATEGORY_UUID);
    const variant = within(screen.getByRole('group', { name: 'Variant 1' }));
    await userEvent.type(variant.getByLabelText('SKU'), 'DUCK-1');
    await userEvent.type(variant.getByLabelText('Variant name'), 'Yellow');
    await userEvent.type(variant.getByLabelText('Price'), '9.99');
    await userEvent.type(variant.getByLabelText('Weight (grams)'), '120');
    await userEvent.clear(variant.getByLabelText('Opening stock'));
    await userEvent.type(variant.getByLabelText('Opening stock'), '5');
  }

  it('posts integer cents and lands on the edit page', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/admin/products`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: makeAdminProduct({ id: 'new1' }) }, { status: 201 });
      }),
      http.get(`${API}/admin/products/new1`, () =>
        HttpResponse.json({ data: makeAdminProduct({ id: 'new1', name: 'Squeaky Duck' }) }),
      ),
    );
    const router = renderApp('/admin/products/new');
    await fillValidProduct();
    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/products/new1'));
    expect(body).toMatchObject({
      name: 'Squeaky Duck',
      categoryId: CATEGORY_UUID,
      status: 'draft',
      variants: [
        {
          sku: 'DUCK-1',
          name: 'Yellow',
          priceCents: 999,
          weightGrams: 120,
          stock: 5,
          isDefault: true,
        },
      ],
    });
  });

  it('shows field problems and sends nothing', async () => {
    let called = false;
    server.use(
      http.post(`${API}/admin/products`, () => {
        called = true;
        return HttpResponse.json({ data: makeAdminProduct() }, { status: 201 });
      }),
    );
    renderApp('/admin/products/new');
    await userEvent.type(await screen.findByLabelText('Name'), 'x');
    const variant = within(screen.getByRole('group', { name: 'Variant 1' }));
    await userEvent.type(variant.getByLabelText('Price'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Category')).toHaveAccessibleDescription('Choose a category'),
    );
    expect(variant.getByLabelText('Price')).toHaveAccessibleDescription(
      /Enter an amount like 12.99/,
    );
    expect(called).toBe(false);
  });

  it('shows the server sentence for a duplicate SKU', async () => {
    server.use(
      http.post(`${API}/admin/products`, () =>
        apiError(409, 'CONFLICT', 'That SKU is already used by another variant'),
      ),
    );
    renderApp('/admin/products/new');
    await fillValidProduct();
    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));
    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'That SKU is already used by another variant',
    );
  });

  it('adds and removes variant blocks, keeping at least one', async () => {
    renderApp('/admin/products/new');
    await screen.findByLabelText('Name');
    expect(screen.getByRole('button', { name: 'Remove variant 1' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Add variant' }));
    expect(screen.getByRole('group', { name: 'Variant 2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove variant 2' }));
    expect(screen.queryByRole('group', { name: 'Variant 2' })).not.toBeInTheDocument();
  });
});

describe('admin product edit', () => {
  it('loads the product into the form and saves only through PATCH', async () => {
    let body: unknown;
    server.use(
      http.get(`${API}/admin/products/p1`, () => HttpResponse.json({ data: makeAdminProduct() })),
      http.patch(`${API}/admin/products/p1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: makeAdminProduct({ name: 'Rope Tug XL' }) });
      }),
    );
    renderApp('/admin/products/p1');
    const name = await screen.findByLabelText('Name');
    expect(name).toHaveValue('Rope Tug');
    expect(screen.getByLabelText('Category')).toHaveValue(CATEGORY_UUID);
    await userEvent.clear(name);
    await userEvent.type(name, 'Rope Tug XL');
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(body).toMatchObject({ name: 'Rope Tug XL', status: 'active' }));
    expect(await screen.findByText('Product saved')).toBeInTheDocument();
  });

  it('says so when the product does not exist', async () => {
    server.use(
      http.get(`${API}/admin/products/nope`, () => apiError(404, 'NOT_FOUND', 'Product not found')),
    );
    renderApp('/admin/products/nope');
    expect(await screen.findByText('That product does not exist.')).toBeInTheDocument();
  });

  it('lists variants and adjusts stock with a reason, including return', async () => {
    let body: unknown;
    server.use(
      http.get(`${API}/admin/products/p1`, () => HttpResponse.json({ data: makeAdminProduct() })),
      http.patch(`${API}/admin/inventory/v1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: {
            variantId: 'v1',
            storeId: MITTE_STORE_ID,
            quantity: 12,
            reserved: 2,
            available: 10,
            delta: 2,
          },
        });
      }),
    );
    renderApp('/admin/products/p1');
    const rows = await screen.findAllByTestId('admin-variant-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('8 available');
    expect(rows[0]).toHaveTextContent('10 on hand, 2 reserved');
    await userEvent.click(screen.getByRole('button', { name: 'Adjust stock for TUG-RED-S' }));
    const form = within(await screen.findByTestId('admin-stock-form'));
    const reasons = within(form.getByLabelText('Reason'))
      .getAllByRole('option')
      .map((o) => o.getAttribute('value'));
    expect(reasons).toEqual(['restock', 'correction', 'damage', 'return']);
    await userEvent.clear(form.getByLabelText('Units on hand'));
    await userEvent.type(form.getByLabelText('Units on hand'), '12');
    await userEvent.selectOptions(form.getByLabelText('Reason'), 'return');
    await userEvent.click(form.getByRole('button', { name: 'Save stock' }));
    await waitFor(() =>
      expect(body).toEqual({
        storeId: MITTE_STORE_ID,
        quantity: 12,
        lowStockThreshold: 3,
        reason: 'return',
      }),
    );
    expect(await screen.findByText('Stock set to 12 (+2) in Grocery Mitte')).toBeInTheDocument();
  });

  it('shows one stock row per store and counts the chosen store', async () => {
    const NEUKOELLN = 'b0000000-0000-4000-8000-000000000004';
    let body: unknown;
    const variant = makeAdminVariant({
      quantity: 17,
      reserved: 2,
      available: 15,
      stores: [
        ...makeAdminVariant().stores,
        {
          storeId: NEUKOELLN,
          storeSlug: 'neukoelln',
          storeName: 'Grocery Neukölln',
          quantity: 7,
          reserved: 0,
          available: 7,
          lowStockThreshold: 9,
        },
      ],
    });
    server.use(
      http.get(`${API}/admin/products/p1`, () =>
        HttpResponse.json({ data: makeAdminProduct({ variants: [variant] }) }),
      ),
      http.patch(`${API}/admin/inventory/v1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: {
            variantId: 'v1',
            storeId: NEUKOELLN,
            quantity: 20,
            reserved: 0,
            available: 20,
            delta: 13,
          },
        });
      }),
    );
    renderApp('/admin/products/p1');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Adjust stock for TUG-RED-S' }),
    );
    const form = within(await screen.findByTestId('admin-stock-form'));
    const rows = form.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('Grocery Neukölln');
    expect(rows[1]).toHaveTextContent('7');
    // Starts on Mitte; switching to Neukölln loads that store's own numbers.
    expect(form.getByLabelText('Units on hand')).toHaveValue('10');
    await userEvent.selectOptions(form.getByLabelText('Store'), NEUKOELLN);
    expect(form.getByLabelText('Units on hand')).toHaveValue('7');
    expect(form.getByLabelText('Low-stock alert at')).toHaveValue('9');
    await userEvent.clear(form.getByLabelText('Units on hand'));
    await userEvent.type(form.getByLabelText('Units on hand'), '20');
    await userEvent.click(form.getByRole('button', { name: 'Save stock' }));
    await waitFor(() =>
      expect(body).toEqual({
        storeId: NEUKOELLN,
        quantity: 20,
        lowStockThreshold: 9,
        reason: 'restock',
      }),
    );
    expect(
      await screen.findByText('Stock set to 20 (+13) in Grocery Neukölln'),
    ).toBeInTheDocument();
  });

  it('shows the refusal when stock is set below what is reserved', async () => {
    server.use(
      http.get(`${API}/admin/products/p1`, () => HttpResponse.json({ data: makeAdminProduct() })),
      http.patch(`${API}/admin/inventory/v1`, () =>
        apiError(409, 'CONFLICT', 'Cannot go below the 2 units reserved by unpaid orders', {
          reserved: 2,
        }),
      ),
    );
    renderApp('/admin/products/p1');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Adjust stock for TUG-RED-S' }),
    );
    const form = within(await screen.findByTestId('admin-stock-form'));
    await userEvent.clear(form.getByLabelText('Units on hand'));
    await userEvent.type(form.getByLabelText('Units on hand'), '1');
    await userEvent.click(form.getByRole('button', { name: 'Save stock' }));
    expect(await form.findByTestId('form-error')).toHaveTextContent('2 units reserved');
  });

  it('edits a variant price without sending stock', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(`${API}/admin/products/p1`, () => HttpResponse.json({ data: makeAdminProduct() })),
      http.patch(`${API}/admin/variants/v2`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: makeAdminVariant({ id: 'v2' }) });
      }),
    );
    renderApp('/admin/products/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit TUG-RED-L' }));
    const form = within(await screen.findByTestId('admin-variant-form'));
    expect(form.queryByLabelText('Opening stock')).not.toBeInTheDocument();
    await userEvent.clear(form.getByLabelText('Price'));
    await userEvent.type(form.getByLabelText('Price'), '21.5');
    await userEvent.click(form.getByRole('button', { name: 'Save variant' }));
    await waitFor(() => expect(body.priceCents).toBe(2150));
    expect(body).not.toHaveProperty('stock');
    expect(body).not.toHaveProperty('quantity');
  });

  it('adds a variant with opening stock', async () => {
    let body: unknown;
    server.use(
      http.get(`${API}/admin/products/p1`, () => HttpResponse.json({ data: makeAdminProduct() })),
      http.post(`${API}/admin/products/p1/variants`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: makeAdminVariant({ id: 'v9' }) }, { status: 201 });
      }),
    );
    renderApp('/admin/products/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Add variant' }));
    const form = within(await screen.findByTestId('admin-variant-form'));
    await userEvent.type(form.getByLabelText('SKU'), 'TUG-NEW');
    await userEvent.type(form.getByLabelText('Variant name'), 'New');
    await userEvent.type(form.getByLabelText('Price'), '5');
    await userEvent.type(form.getByLabelText('Weight (grams)'), '90');
    await userEvent.clear(form.getByLabelText('Opening stock'));
    await userEvent.type(form.getByLabelText('Opening stock'), '4');
    await userEvent.click(form.getByRole('button', { name: 'Add variant' }));
    await waitFor(() =>
      expect(body).toMatchObject({ sku: 'TUG-NEW', priceCents: 500, stock: 4, isDefault: false }),
    );
  });

  it('deletes a variant after confirmation and shows the refusal if the API says no', async () => {
    server.use(
      http.get(`${API}/admin/products/p1`, () => HttpResponse.json({ data: makeAdminProduct() })),
      http.delete(`${API}/admin/variants/v2`, () =>
        apiError(409, 'CONFLICT', 'Unpaid orders reserve this variant; archive it instead'),
      ),
    );
    renderApp('/admin/products/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete TUG-RED-L' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete variant' }));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('archive it instead');
  });

  it('handles 120 variants with a filter and a table that scrolls inside its box', async () => {
    const variants = Array.from({ length: 120 }, (_, i) =>
      makeAdminVariant({
        id: `v${i}`,
        sku: `BULK-${String(i).padStart(3, '0')}`,
        name: `Bulk ${i}`,
        isDefault: i === 0,
      }),
    );
    server.use(
      http.get(`${API}/admin/products/p1`, () =>
        HttpResponse.json({ data: makeAdminProduct({ variants }) }),
      ),
    );
    renderApp('/admin/products/p1');
    expect(await screen.findAllByTestId('admin-variant-row')).toHaveLength(120);
    expect(screen.getByRole('heading', { name: 'Variants (120)' })).toBeInTheDocument();
    expect(screen.getByTestId('admin-table').className).toContain('overflow-auto');
    await userEvent.type(screen.getByLabelText('Filter variants'), 'BULK-11');
    await waitFor(() => expect(screen.getAllByTestId('admin-variant-row')).toHaveLength(10));
    await userEvent.clear(screen.getByLabelText('Filter variants'));
    await userEvent.type(screen.getByLabelText('Filter variants'), 'nothing-like-this');
    expect(await screen.findByText('No variant matches that filter.')).toBeInTheDocument();
  });
});
