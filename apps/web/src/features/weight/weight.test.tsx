import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { makeCard, makeCartItem } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { CartLine } from '../cart/CartLine';
import { ProductCard } from '../catalog/ProductCard';

import { WeighedNotice, WeightLine, weighedLineCents } from './Weight';

const banana = makeCartItem({
  id: 'w1',
  productName: 'Bananas',
  unitPriceCents: 189,
  quantity: 1,
  lineTotalCents: 189,
  weight: { pricePerKgCents: 378, nominalGrams: 500 },
});

describe('weight line', () => {
  it('says about how much, the price per kilo and the estimate', () => {
    renderWithProviders(
      <WeightLine grams={500} pricePerKgCents={378} estimateCents={189} currency="EUR" />,
    );
    expect(screen.getByTestId('weight-line')).toHaveTextContent(
      'about 500 g · €3.78/kg · est. €1.89',
    );
  });
});

describe('weighed notice', () => {
  it('names the amount held on the card: the total plus 15 % of the weighed lines', () => {
    renderWithProviders(<WeighedNotice items={[banana]} totalCents={189} currency="EUR" />);
    expect(screen.getByTestId('weighed-notice')).toHaveTextContent(
      'Final price after weighing. We hold up to €2.17 on your card and take only what it weighs.',
    );
  });
  it('counts only the weighed lines for the buffer, and shows nothing without one', () => {
    const plain = makeCartItem({ id: 'p1', lineTotalCents: 1000, unitPriceCents: 1000 });
    expect(weighedLineCents([banana, plain])).toEqual([189]);
    const { unmount } = renderWithProviders(
      <WeighedNotice items={[banana, plain]} totalCents={1189 + 299} currency="EUR" />,
    );
    expect(screen.getByTestId('weighed-notice')).toHaveTextContent('up to €15.16'); // 1488 + 28
    unmount();
    renderWithProviders(<WeighedNotice items={[plain]} totalCents={1000} currency="EUR" />);
    expect(screen.queryByTestId('weighed-notice')).not.toBeInTheDocument();
  });
});

describe('weighed items in the cart and on cards', () => {
  it('shows a weighed cart line as an estimate', () => {
    renderWithProviders(
      <MemoryRouter>
        <ul>
          <CartLine
            item={{ ...banana, quantity: 2, lineTotalCents: 378 }}
            currency="EUR"
            notices={[]}
            onDismissNotice={vi.fn()}
            onQuantity={vi.fn()}
            onRemove={vi.fn()}
          />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('weight-line')).toHaveTextContent('about 500 g');
    expect(screen.getByTestId('cart-line-total')).toHaveTextContent('est. €3.78');
  });
  it('shows "about 500 g" on a weighed card only', () => {
    const { unmount } = renderWithProviders(
      <MemoryRouter>
        <ul>
          <ProductCard product={makeCard({ weighedGrams: 500 })} />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('weight-line')).toHaveTextContent('about 500 g');
    unmount();
    renderWithProviders(
      <MemoryRouter>
        <ul>
          <ProductCard product={makeCard()} />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('weight-line')).not.toBeInTheDocument();
  });
});
