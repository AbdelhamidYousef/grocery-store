import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  makeAdminCollection,
  makeAdminProduct,
  makeAdminRow,
  makeBrand,
} from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

import { collectionStatus } from './CollectionsAdmin';

beforeEach(() => {
  server.use(signedInAs({ role: 'admin' }));
});

const tag = { id: 't1', slug: 'joints', name: 'Joints & mobility', productCount: 3 };

describe('admin navigation', () => {
  it('links the three merchandising screens', async () => {
    server.use(http.get(`${API}/admin/brands`, () => HttpResponse.json({ data: [] })));
    renderApp('/admin/brands');
    const nav = await screen.findByTestId('admin-nav');
    for (const name of ['Brands', 'Collections', 'Tags'])
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
  });
});

describe('admin brands', () => {
  it('lists brands and creates one with the typed values', async () => {
    let created: unknown;
    server.use(
      http.get(`${API}/admin/brands`, () => HttpResponse.json({ data: [makeBrand()] })),
      http.post(`${API}/admin/brands`, async ({ request }) => {
        created = await request.json();
        return HttpResponse.json(
          { data: makeBrand({ id: 'b2', slug: 'new', name: 'New' }) },
          { status: 201 },
        );
      }),
    );
    renderApp('/admin/brands');
    expect(await screen.findAllByTestId('admin-brand-row')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'New brand' }));
    const form = await screen.findByTestId('admin-brand-form');
    await userEvent.type(within(form).getByLabelText('Name'), 'Fresh Co');
    await userEvent.type(within(form).getByLabelText('Slug'), 'fresh-co');
    await userEvent.type(within(form).getByLabelText('Tagline'), 'A new label');
    await userEvent.click(within(form).getByRole('button', { name: 'Create brand' }));
    await waitFor(() => expect(created).toMatchObject({ slug: 'fresh-co', name: 'Fresh Co' }));
  });

  it('refuses a bad slug before sending anything, and shows a duplicate-slug 409', async () => {
    let posts = 0;
    server.use(
      http.get(`${API}/admin/brands`, () => HttpResponse.json({ data: [] })),
      http.post(`${API}/admin/brands`, () => {
        posts += 1;
        return HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'That slug is already used by another brand' } },
          { status: 409 },
        );
      }),
    );
    renderApp('/admin/brands');
    await userEvent.click(await screen.findByRole('button', { name: 'New brand' }));
    const form = await screen.findByTestId('admin-brand-form');
    await userEvent.type(within(form).getByLabelText('Name'), 'X');
    await userEvent.type(within(form).getByLabelText('Slug'), 'Bad Slug');
    await userEvent.click(within(form).getByRole('button', { name: 'Create brand' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('slug');
    expect(posts).toBe(0);

    await userEvent.clear(within(form).getByLabelText('Slug'));
    await userEvent.type(within(form).getByLabelText('Slug'), 'taken');
    await userEvent.click(within(form).getByRole('button', { name: 'Create brand' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('already used');
  });

  it('shows the slug as fixed when editing', async () => {
    server.use(http.get(`${API}/admin/brands`, () => HttpResponse.json({ data: [makeBrand()] })));
    renderApp('/admin/brands');
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    expect(await screen.findByLabelText('Slug')).toBeDisabled();
  });
});

describe('admin collections', () => {
  it('shows a status per collection', () => {
    const now = new Date('2026-10-31T12:00:00Z');
    const base = makeAdminCollection();
    expect(collectionStatus(base, now)).toBe('Live');
    expect(collectionStatus({ ...base, isActive: false }, now)).toBe('Off');
    expect(collectionStatus({ ...base, startsAt: '2026-11-15T00:00:00Z' }, now)).toBe('Scheduled');
    expect(collectionStatus({ ...base, endsAt: '2026-10-31T00:00:00Z' }, now)).toBe('Ended');
    expect(collectionStatus({ ...base, startsAt: null, endsAt: null }, now)).toBe('Live');
  });

  it('reorders products with the buttons and saves the whole ordered list', async () => {
    let put: unknown;
    server.use(
      http.get(`${API}/admin/collections`, () =>
        HttpResponse.json({ data: [makeAdminCollection()] }),
      ),
      http.get(`${API}/admin/products`, () =>
        HttpResponse.json({
          data: [makeAdminRow({ id: 'p3', slug: 'sock', name: 'Sock Toy' })],
          meta: { page: 1, limit: 8, total: 1, totalPages: 1 },
        }),
      ),
      http.put(`${API}/admin/collections/:id/products`, async ({ request }) => {
        put = await request.json();
        return HttpResponse.json({ data: makeAdminCollection() });
      }),
    );
    renderApp('/admin/collections');
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    const members = await screen.findAllByTestId('collection-member');
    expect(members.map((m) => m.textContent)).toEqual([
      expect.stringContaining('Pumpkin Ball'),
      expect.stringContaining('Bat Teaser'),
    ]);
    // The first cannot move up, the last cannot move down.
    expect(screen.getByRole('button', { name: 'Move Pumpkin Ball up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Bat Teaser down' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Move Bat Teaser up' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add Sock Toy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save products and order' }));
    await waitFor(() => expect(put).toEqual({ productIds: ['p2', 'p1', 'p3'] }));
  });

  it('removes a product from the list and keeps Save off until something changed', async () => {
    server.use(
      http.get(`${API}/admin/collections`, () =>
        HttpResponse.json({ data: [makeAdminCollection()] }),
      ),
      http.get(`${API}/admin/products`, () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 8, total: 0, totalPages: 0 } }),
      ),
    );
    renderApp('/admin/collections');
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    const save = await screen.findByRole('button', { name: 'Save products and order' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Pumpkin Ball' }));
    expect(save).toBeEnabled();
    expect(screen.getAllByTestId('collection-member')).toHaveLength(1);
  });

  it('sends the window as UTC instants when saving details', async () => {
    let patched: unknown;
    server.use(
      http.get(`${API}/admin/collections`, () =>
        HttpResponse.json({ data: [makeAdminCollection()] }),
      ),
      http.get(`${API}/admin/products`, () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 8, total: 0, totalPages: 0 } }),
      ),
      http.patch(`${API}/admin/collections/:id`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ data: makeAdminCollection() });
      }),
    );
    renderApp('/admin/collections');
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    const form = await screen.findByTestId('admin-collection-form');
    await userEvent.click(within(form).getByRole('button', { name: 'Save details' }));
    await waitFor(() =>
      expect(patched).toMatchObject({
        startsAt: '2026-10-01T00:00:00.000Z',
        endsAt: '2026-11-03T00:00:00.000Z',
        isActive: true,
      }),
    );
  });
});

describe('admin tags', () => {
  it('lists tags and creates one', async () => {
    let created: unknown;
    server.use(
      http.get(`${API}/admin/tags`, () => HttpResponse.json({ data: [tag] })),
      http.post(`${API}/admin/tags`, async ({ request }) => {
        created = await request.json();
        return HttpResponse.json(
          { data: { id: 't2', slug: 'dental', name: 'Dental care', productCount: 0 } },
          { status: 201 },
        );
      }),
    );
    renderApp('/admin/tags');
    expect(await screen.findAllByTestId('admin-tag-row')).toHaveLength(1);
    await userEvent.type(screen.getByLabelText('Name'), 'Dental care');
    await userEvent.type(screen.getByLabelText('Slug'), 'dental');
    await userEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    await waitFor(() => expect(created).toEqual({ slug: 'dental', name: 'Dental care' }));
  });

  it('renames a tag and asks before deleting', async () => {
    let renamed: unknown;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let deletes = 0;
    server.use(
      http.get(`${API}/admin/tags`, () => HttpResponse.json({ data: [tag] })),
      http.patch(`${API}/admin/tags/:id`, async ({ request }) => {
        renamed = await request.json();
        return HttpResponse.json({ data: { ...tag, name: 'Joints' } });
      }),
      http.delete(`${API}/admin/tags/:id`, () => {
        deletes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/admin/tags');
    await userEvent.click(await screen.findByRole('button', { name: /Delete/ }));
    expect(confirm).toHaveBeenCalled();
    expect(deletes).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: /Rename/ }));
    const input = screen.getByLabelText('New name for Joints & mobility');
    await userEvent.clear(input);
    await userEvent.type(input, 'Joints');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(renamed).toEqual({ name: 'Joints' }));
    confirm.mockRestore();
  });
});

describe('product merchandising', () => {
  it('saves brand, flags and tags on the product page', async () => {
    let patched: unknown;
    let tagsPut: unknown;
    server.use(
      http.get(`${API}/admin/products/:id`, () => HttpResponse.json({ data: makeAdminProduct() })),
      http.get(`${API}/admin/brands`, () => HttpResponse.json({ data: [makeBrand()] })),
      http.get(`${API}/admin/tags`, () => HttpResponse.json({ data: [tag] })),
      http.patch(`${API}/admin/products/:id`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ data: makeAdminProduct() });
      }),
      http.put(`${API}/admin/products/:id/tags`, async ({ request }) => {
        tagsPut = await request.json();
        return HttpResponse.json({
          data: [{ id: 't1', slug: 'joints', name: 'Joints & mobility' }],
        });
      }),
    );
    renderApp('/admin/products/p1');
    const box = await screen.findByTestId('product-merchandising');
    await userEvent.selectOptions(await within(box).findByLabelText('Brand'), 'b1');
    await userEvent.click(within(box).getByRole('checkbox', { name: 'Eco badge' }));
    await userEvent.click(within(box).getByRole('checkbox', { name: 'Always show Bestseller' }));
    await userEvent.click(await within(box).findByRole('checkbox', { name: 'Joints & mobility' }));
    await userEvent.click(within(box).getByRole('button', { name: 'Save merchandising' }));
    await waitFor(() =>
      expect(patched).toEqual({
        brandId: 'b1',
        isEco: true,
        isBestsellerOverride: true,
        badgeNewUntil: null,
      }),
    );
    await waitFor(() => expect(tagsPut).toEqual({ tagIds: ['t1'] }));
  });
});
