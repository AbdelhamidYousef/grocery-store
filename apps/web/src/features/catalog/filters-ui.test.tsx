import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeCard, makeFacets, makeList } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

async function open(path: string) {
  const router = renderApp(path);
  await screen.findAllByTestId('product-card');
  return router;
}
const sidebar = () => within(screen.getByTestId('filters'));

describe('filters and sort', () => {
  it('builds groups from facets, hiding groups that cannot narrow anything', async () => {
    await open('/c/dogs');
    expect(sidebar().getByRole('group', { name: 'Material' })).toBeInTheDocument();
    expect(sidebar().queryByRole('group', { name: 'Brand' })).not.toBeInTheDocument();
    expect(sidebar().getByRole('checkbox', { name: 'Cotton rope (1)' })).toBeInTheDocument();
    expect(sidebar().getByRole('switch', { name: 'In stock only' })).toBeInTheDocument();
  });

  it('writes a ticked value to the url, shows a chip and removes it again', async () => {
    const router = await open('/c/dogs');
    await userEvent.click(sidebar().getByRole('checkbox', { name: 'Cotton rope (1)' }));
    await waitFor(() => expect(router.state.location.search).toBe('?attr.material=cotton+rope'));
    const chip = await screen.findByRole('button', { name: 'Remove filter Material: Cotton rope' });
    await userEvent.click(chip);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('toggles in-stock and sends it to the api', async () => {
    const router = await open('/c/dogs');
    await userEvent.click(sidebar().getByRole('switch', { name: 'In stock only' }));
    await waitFor(() => expect(router.state.location.search).toBe('?inStock=true'));
  });

  it('moves the price handles with the keyboard and applies the range once, in cents', async () => {
    const router = await open('/c/dogs');
    // Facet range 7.99..18.99 becomes whole euros: 7..19.
    const min = sidebar().getByRole('slider', { name: 'Minimum price' });
    const max = sidebar().getByRole('slider', { name: 'Maximum price' });
    expect(min).toHaveAttribute('min', '700');
    expect(max).toHaveAttribute('max', '1900');
    expect(sidebar().getByTestId('price-range-text')).toHaveTextContent('€7.00 to €19.00');

    fireEvent.change(min, { target: { value: '1000' } });
    fireEvent.change(max, { target: { value: '1500' } });
    // Nothing is written while the handles are moving...
    expect(router.state.location.search).toBe('');
    expect(sidebar().getByTestId('price-range-text')).toHaveTextContent('€10.00 to €15.00');
    // ...only on release.
    fireEvent.pointerUp(max);
    await waitFor(() => expect(router.state.location.search).toBe('?minPrice=1000&maxPrice=1500'));
    expect(
      await screen.findByRole('button', { name: 'Remove filter Price: €10.00 - €15.00' }),
    ).toBeInTheDocument();
  });

  it('never lets the minimum pass the maximum, and a handle at its end means no limit', async () => {
    const router = await open('/c/dogs?minPrice=1000&maxPrice=1500');
    const min = sidebar().getByRole('slider', { name: 'Minimum price' });
    const max = sidebar().getByRole('slider', { name: 'Maximum price' });
    expect(min).toHaveValue('1000');
    expect(max).toHaveValue('1500');
    fireEvent.change(min, { target: { value: '1800' } });
    expect(min).toHaveValue('1500');
    expect(sidebar().getByTestId('price-range-text')).toHaveTextContent('€15.00 to €15.00');
    fireEvent.change(min, { target: { value: '700' } });
    fireEvent.change(max, { target: { value: '1900' } });
    fireEvent.pointerUp(max);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('reflects the url on load and keeps the chosen range after a reload', async () => {
    await open('/c/dogs?minPrice=800&maxPrice=1200&inStock=true');
    expect(sidebar().getByRole('slider', { name: 'Minimum price' })).toHaveValue('800');
    expect(sidebar().getByRole('slider', { name: 'Maximum price' })).toHaveValue('1200');
    expect(sidebar().getByRole('switch', { name: 'In stock only' })).toBeChecked();
  });

  it('changes sort through the url and keeps the default out of it', async () => {
    const router = await open('/c/dogs');
    const select = screen.getByRole('combobox', { name: 'Sort by' });
    expect(select).toHaveValue('newest');
    expect(within(select).queryByRole('option', { name: 'Best match' })).not.toBeInTheDocument();
    await userEvent.selectOptions(select, 'price_desc');
    await waitFor(() => expect(router.state.location.search).toBe('?sort=price_desc'));
    await userEvent.selectOptions(select, 'newest');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('offers Best match on a search and defaults to it', async () => {
    await open('/search?q=rope');
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('relevance');
  });

  it('folds long value lists behind a show-more button but keeps selected values visible', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ value: `mat ${i}`, count: 1 }));
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json(
          makeList([makeCard()], {
            facets: makeFacets({ attributes: { material: many } }),
          }),
        ),
      ),
    );
    await open('/c/dogs?attr.material=mat%2011');
    const group = within(sidebar().getByRole('group', { name: 'Material' }));
    expect(group.getAllByRole('checkbox')).toHaveLength(7); // 6 + the selected one
    expect(group.getByRole('checkbox', { name: 'Mat 11 (1)' })).toBeChecked();
    const more = group.getByRole('button', { name: 'Show 5 more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);
    expect(group.getAllByRole('checkbox')).toHaveLength(12);
    expect(group.getByRole('button', { name: /Show fewer/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('opens the filters in a drawer on small screens', async () => {
    await open('/c/dogs');
    await userEvent.click(screen.getByTestId('filters-toggle'));
    const drawer = within(await screen.findByTestId('filters-drawer'));
    expect(drawer.getByRole('switch', { name: 'In stock only' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show 2 products/ })).toBeInTheDocument();
  });

  it('announces the result count in a live region', async () => {
    await open('/c/dogs');
    expect(screen.getByTestId('result-count')).toHaveAttribute('role', 'status');
  });
});

describe('brand and health-need filters, unit price sort', () => {
  const facets = makeFacets({
    brand: [
      { value: 'burrow-and-biscuit', label: 'Burrow & Biscuit', count: 3 },
      { value: 'pawsome', label: 'Pawsome', count: 2 },
    ],
    tag: [{ value: 'joints', label: 'Joints & mobility', count: 2 }],
  });
  const serve = () =>
    server.use(
      http.get(`${API}/products`, () => HttpResponse.json(makeList([makeCard()], { facets }))),
    );

  it('shows brand and "Shop by health need" groups with display names', async () => {
    serve();
    await open('/c/dogs');
    expect(sidebar().getByRole('group', { name: 'Brand' })).toBeInTheDocument();
    expect(sidebar().getByRole('group', { name: 'Shop by health need' })).toBeInTheDocument();
    expect(sidebar().getByRole('checkbox', { name: 'Burrow & Biscuit (3)' })).toBeInTheDocument();
    expect(sidebar().getByRole('checkbox', { name: 'Joints & mobility (2)' })).toBeInTheDocument();
  });

  it('writes brand and tag to the url, shows named chips and removes them', async () => {
    serve();
    const router = await open('/c/dogs');
    await userEvent.click(sidebar().getByRole('checkbox', { name: 'Burrow & Biscuit (3)' }));
    await waitFor(() => expect(router.state.location.search).toBe('?brand=burrow-and-biscuit'));
    await userEvent.click(sidebar().getByRole('checkbox', { name: 'Joints & mobility (2)' }));
    await waitFor(() =>
      expect(router.state.location.search).toBe('?brand=burrow-and-biscuit&tag=joints'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove filter Health need: Joints & mobility' }),
    );
    await waitFor(() => expect(router.state.location.search).toBe('?brand=burrow-and-biscuit'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove filter Brand: Burrow & Biscuit' }),
    );
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('reads the filters from the url and sends them to the api', async () => {
    let seen = '';
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json(makeList([makeCard()], { facets }));
      }),
    );
    await open('/c/dogs?brand=pawsome&tag=joints');
    expect(seen).toContain('brand=pawsome');
    expect(seen).toContain('tag=joints');
    expect(sidebar().getByRole('checkbox', { name: 'Pawsome (2)' })).toBeChecked();
  });

  it('offers "Lowest unit price" and keeps it in the url', async () => {
    const router = await open('/c/dogs');
    const select = screen.getByRole('combobox', { name: 'Sort by' });
    await userEvent.selectOptions(select, 'unit_price_asc');
    await waitFor(() => expect(router.state.location.search).toBe('?sort=unit_price_asc'));
    expect(select).toHaveValue('unit_price_asc');
  });

  it('explains unit prices once when any card has one', async () => {
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json(
          makeList([makeCard({ unitPrice: { cents: 420, per: 'kg' } })], { facets }),
        ),
      ),
    );
    await open('/c/dogs');
    expect(screen.getAllByText(/Unit prices are per kg or litre/)).toHaveLength(1);
  });
});
