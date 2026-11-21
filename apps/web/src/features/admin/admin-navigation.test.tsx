import type { AdminMenuPromo } from '@store/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

const promo = (over: Partial<AdminMenuPromo> = {}): AdminMenuPromo => ({
  id: '11111111-1111-4111-8111-111111111111',
  categoryId: 'c1',
  title: 'Walkies',
  subtitle: 'Leads',
  imageUrl: '/products/cheese/x.webp',
  imageAlt: 'A lead',
  link: '/c/dog-walk',
  sortOrder: 0,
  active: true,
  ...over,
});

function serve(initial: AdminMenuPromo[]) {
  const state = {
    list: initial,
    patches: [] as { id: string; body: unknown }[],
    created: undefined as unknown,
  };
  server.use(
    signedInAs({ role: 'admin' }),
    http.get(`${API}/admin/menu-promos`, () => HttpResponse.json({ data: state.list })),
    http.patch(`${API}/admin/menu-promos/:id`, async ({ params, request }) => {
      const body = (await request.json()) as Partial<AdminMenuPromo>;
      state.patches.push({ id: String(params.id), body });
      state.list = state.list
        .map((p) => (p.id === params.id ? { ...p, ...body } : p))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return HttpResponse.json({ data: state.list.find((p) => p.id === params.id) });
    }),
    http.post(`${API}/admin/menu-promos`, async ({ request }) => {
      state.created = await request.json();
      const created = promo({
        ...(state.created as object),
        id: '22222222-2222-4222-8222-222222222222',
        sortOrder: 5,
      });
      state.list = [...state.list, created];
      return HttpResponse.json({ data: created }, { status: 201 });
    }),
  );
  return state;
}

describe('admin menu promos', () => {
  it('lists promos in order with their department and link, and hides inactive ones with a badge', async () => {
    serve([
      promo(),
      promo({ id: '3', title: 'Bakery', categoryId: null, sortOrder: 1, active: false }),
    ]);
    renderApp('/admin/navigation');
    const rows = await screen.findAllByTestId('admin-promo-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Walkies');
    expect(rows[0]).toHaveTextContent('Dairy & eggs');
    expect(rows[1]).toHaveTextContent('Hidden');
  });

  it('reorders by swapping list positions', async () => {
    const state = serve([promo(), promo({ id: 'b', title: 'Second', sortOrder: 1 })]);
    renderApp('/admin/navigation');
    const rows = await screen.findAllByTestId('admin-promo-row');
    await userEvent.click(within(rows[1]!).getByRole('button', { name: /^Move up/ }));
    await waitFor(() => expect(state.patches).toHaveLength(2));
    expect(state.patches).toEqual(
      expect.arrayContaining([
        { id: 'b', body: { sortOrder: 0 } },
        { id: '11111111-1111-4111-8111-111111111111', body: { sortOrder: 1 } },
      ]),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('admin-promo-row')[0]).toHaveTextContent('Second'),
    );
  });

  it('validates the form, previews the tile live, and creates a promo', async () => {
    const state = serve([]);
    renderApp('/admin/navigation');
    await userEvent.click(await screen.findByRole('button', { name: 'New promo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create promo' }));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('title');
    expect(screen.queryByTestId('admin-promo-preview')).not.toBeInTheDocument();

    // Typing every character would only make the test slow; one change event per field is enough.
    const fill = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fill('Title', 'Summer sale');
    fill('Image', '/products/x.webp');
    fill('Image description', 'Sunny');
    fill('Link', '//evil.example');
    expect(screen.queryByTestId('admin-promo-preview')).not.toBeInTheDocument();
    fill('Link', '/collections/summer');
    expect(await screen.findByTestId('admin-promo-preview')).toHaveTextContent('Summer sale');

    await userEvent.click(screen.getByRole('button', { name: 'Create promo' }));
    await waitFor(() =>
      expect(state.created).toMatchObject({
        title: 'Summer sale',
        categoryId: null,
        link: '/collections/summer',
      }),
    );
  });
});
