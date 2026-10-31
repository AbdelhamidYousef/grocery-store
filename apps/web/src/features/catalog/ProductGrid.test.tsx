import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as tracking from '../../lib/track';
import { makeCard } from '../../test/fixtures';

import { ProductGrid } from './ProductGrid';

const renderGrid = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ProductGrid', () => {
  it('renders each product as one link with name, price range and a sized image', () => {
    renderGrid(<ProductGrid products={[makeCard()]} listId="dogs" />);
    const link = screen.getByRole('link', { name: /Rope Tug/ });
    expect(link).toHaveAttribute('href', '/products/rope-tug');
    expect(within(link).getByTestId('price-current')).toHaveTextContent('€10.99 - €18.99');
    const img = within(link).getByRole('img', { name: 'A braided rope tug toy' });
    expect(img).toHaveAttribute('width', '1200');
    expect(img).toHaveAttribute('height', '1200');
    expect(img).toHaveAttribute('srcset', expect.stringContaining('rope-tug-1-600.webp 600w'));
  });

  it('shows a Sold out badge only for products that are out of stock', () => {
    renderGrid(
      <ProductGrid
        products={[makeCard(), makeCard({ id: 'p2', slug: 'gone', name: 'Gone', inStock: false })]}
        listId="dogs"
      />,
    );
    expect(screen.getAllByTestId('sold-out-badge')).toHaveLength(1);
    expect(within(screen.getByRole('link', { name: /Gone/ })).getByText('Sold out')).toBeVisible();
  });

  it('loads the first row eagerly and the rest lazily', () => {
    renderGrid(
      <ProductGrid
        products={[makeCard(), makeCard({ id: 'p2', slug: 'b', name: 'B' })]}
        listId="dogs"
        eagerCount={1}
      />,
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs[0]).toHaveAttribute('loading', 'eager');
    expect(imgs[1]).toHaveAttribute('loading', 'lazy');
  });

  it('tracks view_item_list once for the list', () => {
    const spy = vi.spyOn(tracking, 'track').mockImplementation(() => undefined);
    const { rerender } = renderGrid(<ProductGrid products={[makeCard()]} listId="dogs" />);
    rerender(
      <MemoryRouter>
        <ProductGrid products={[makeCard()]} listId="dogs" />
      </MemoryRouter>,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      name: 'view_item_list',
      listId: 'dogs',
      items: [{ id: 'p1', name: 'Rope Tug', price: 1099 }],
    });
    spy.mockRestore();
  });
});
