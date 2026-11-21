import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { makeCard, makeCartItem, makeVariant } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { API, server } from '../../test/server';
import { CartLine } from '../cart/CartLine';

import { BestBeforeNote, ShortDatedOffer } from './BestBefore';
import { ShortDatedShelf } from './ShortDatedShelf';

const offer = { units: 3, bestBefore: '2026-11-23', priceCents: 139, percentOff: 30 };

describe('best before note', () => {
  it('says how long the oldest pack lasts, and nothing for non-food', () => {
    const { unmount } = renderWithProviders(
      <BestBeforeNote variant={makeVariant({ bestBefore: '2026-11-25' })} />,
    );
    expect(screen.getByTestId('best-before')).toHaveTextContent('Best before at least 25 Nov');
    unmount();
    renderWithProviders(<BestBeforeNote variant={makeVariant({ bestBefore: null })} />);
    expect(screen.queryByTestId('best-before')).not.toBeInTheDocument();
  });
});

describe('short-dated offer on the product page', () => {
  it('shows packs, date, discount and price, and adds on its own button', async () => {
    const onAdd = vi.fn();
    renderWithProviders(
      <ShortDatedOffer
        variant={makeVariant({ shortDated: offer })}
        name="Yoghurt"
        pending={false}
        onAdd={onAdd}
      />,
    );
    const box = screen.getByTestId('short-dated-offer');
    expect(box).toHaveTextContent('3 packs, best before 23 Nov, 30 % off');
    expect(box).toHaveTextContent('1.39');
    await userEvent.click(
      screen.getByRole('button', { name: 'Add short-dated Yoghurt to your cart' }),
    );
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('uses the singular for one pack and shows nothing without an offer', () => {
    const { unmount } = renderWithProviders(
      <ShortDatedOffer
        variant={makeVariant({ shortDated: { ...offer, units: 1 } })}
        name="Yoghurt"
        pending={false}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByTestId('short-dated-offer')).toHaveTextContent('1 pack, best before');
    unmount();
    renderWithProviders(
      <ShortDatedOffer variant={makeVariant()} name="Yoghurt" pending={false} onAdd={vi.fn()} />,
    );
    expect(screen.queryByTestId('short-dated-offer')).not.toBeInTheDocument();
  });
});

describe('short-dated shelf', () => {
  it('lists the deals of the store', async () => {
    server.use(
      http.get(`${API}/products/short-dated`, () =>
        HttpResponse.json({ data: [makeCard({ id: 'a', name: 'Greek yoghurt' })] }),
      ),
    );
    renderWithProviders(
      <MemoryRouter>
        <ShortDatedShelf />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Short-dated deals' })).toBeInTheDocument();
    expect(screen.getByTestId('short-dated-list')).toHaveTextContent('Greek yoghurt');
  });

  it('renders nothing when the store has no short-dated packs', async () => {
    renderWithProviders(
      <MemoryRouter>
        <ShortDatedShelf />
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('short-dated-shelf')).not.toBeInTheDocument();
  });
});

describe('cart line', () => {
  const props = {
    currency: 'EUR',
    notices: [],
    onDismissNotice: vi.fn(),
    onQuantity: vi.fn(),
    onRemove: vi.fn(),
  };
  it('marks a short-dated line with its date and discount', () => {
    renderWithProviders(
      <MemoryRouter>
        <ul>
          <CartLine
            {...props}
            item={makeCartItem({ shortDated: true, bestBefore: '2026-11-23', unitPriceCents: 139 })}
          />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('cart-line-short-dated')).toHaveTextContent(
      'Short dateBest before 23 Nov, 30 % off',
    );
  });
  it('shows no mark on a normal line', () => {
    renderWithProviders(
      <MemoryRouter>
        <ul>
          <CartLine {...props} item={makeCartItem()} />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('cart-line-short-dated')).not.toBeInTheDocument();
  });
});
