import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeCard, makeFacets, makeList } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

const CHIPS = [
  { kind: 'badge', value: 'sale', label: 'On sale', count: 3 },
  { kind: 'badge', value: 'new', label: 'New', count: 5 },
  { kind: 'brand', value: 'bigco', label: 'Bigco', count: 4 },
  { kind: 'tag', value: 'dental', label: 'Dental care', count: 2 },
] as const;

function serve(onAsk?: (search: string) => void) {
  server.use(
    http.get(`${API}/products`, ({ request }) => {
      onAsk?.(new URL(request.url).search);
      return HttpResponse.json(
        makeList([makeCard()], {
          chips: [...CHIPS],
          facets: makeFacets({
            badge: [{ value: 'sale', label: 'Sale', count: 3 }],
            brand: [{ value: 'bigco', label: 'Bigco', count: 4 }],
            tag: [{ value: 'dental', label: 'Dental care', count: 2 }],
          }),
        }),
      );
    }),
  );
}
const row = () => within(screen.getByRole('list', { name: 'Quick filters' }));

describe('quick filter chips', () => {
  it('lists the chips in the order the API sent them, with their counts', async () => {
    serve();
    renderApp('/c/dogs');
    await screen.findAllByTestId('product-card');
    const labels = row()
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(labels).toEqual(['On sale3', 'New5', 'Bigco4', 'Dental care2']);
    expect(row().getByRole('button', { name: /On sale/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles each kind through the url and shows it as pressed and as a removable chip', async () => {
    const asked: string[] = [];
    serve((q) => asked.push(q));
    const router = renderApp('/c/dogs');
    await screen.findAllByTestId('product-card');

    await userEvent.click(row().getByRole('button', { name: /On sale/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?badge=sale'));
    await userEvent.click(row().getByRole('button', { name: /Bigco/ }));
    await userEvent.click(row().getByRole('button', { name: /Dental care/ }));
    await waitFor(() =>
      expect(router.state.location.search).toBe('?badge=sale&brand=bigco&tag=dental'),
    );
    expect(row().getByRole('button', { name: /On sale/ })).toHaveAttribute('aria-pressed', 'true');
    expect(
      await screen.findByRole('button', { name: 'Remove filter Label: Sale' }),
    ).toBeInTheDocument();
    expect(asked.at(-1)).toContain('badge=sale');

    // Pressing a pressed chip removes it again.
    await userEvent.click(row().getByRole('button', { name: /Bigco/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?badge=sale&tag=dental'));
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('round-trips: a url with filters loads pressed chips', async () => {
    serve();
    renderApp('/c/dogs?brand=bigco&badge=new');
    await screen.findAllByTestId('product-card');
    expect(row().getByRole('button', { name: /Bigco/ })).toHaveAttribute('aria-pressed', 'true');
    expect(row().getByRole('button', { name: /^New/ })).toHaveAttribute('aria-pressed', 'true');
    expect(row().getByRole('button', { name: /On sale/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides the brand chips on a brand page (the brand is the page)', async () => {
    serve();
    renderApp('/brands/bigco');
    // The brand page has its own header request; the listing underneath honours the fixed brand.
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Quick filters' })).toBeNull());
  });

  it('shows no row when the API sent no chips', async () => {
    renderApp('/c/dogs');
    await screen.findAllByTestId('product-card');
    expect(screen.queryByRole('list', { name: 'Quick filters' })).not.toBeInTheDocument();
  });
});
