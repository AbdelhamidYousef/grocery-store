import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeOrder } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';

import { OrderSummary } from './OrderSummary';

const order = makeOrder();
const weighedItem = {
  ...order.items[0]!,
  id: 'w1',
  productName: 'Bananas',
  pricePerKgCents: 378,
  weighedGrams: null as number | null,
  finalCents: null as number | null,
};

describe('order summary: what is held and what was charged', () => {
  it('says nothing about a hold for an order charged in full at once', () => {
    renderWithProviders(<OrderSummary items={order.items} totals={order.totals} />);
    expect(screen.queryByTestId('order-held')).not.toBeInTheDocument();
    expect(screen.queryByTestId('order-final-bill')).not.toBeInTheDocument();
  });

  it('says how much is held and that it is charged when we pack the order', () => {
    renderWithProviders(
      <OrderSummary items={order.items} totals={order.totals} authorizedCents={4297} />,
    );
    expect(screen.getByTestId('order-held')).toHaveTextContent(
      '€42.97 is held on your card and charged when we pack your order.',
    );
  });

  it('for weighed lines says it holds up to the amount and charges what the bag weighs', () => {
    renderWithProviders(
      <OrderSummary items={[weighedItem]} totals={order.totals} authorizedCents={2410} />,
    );
    expect(screen.getByTestId('order-held')).toHaveTextContent(
      'We hold up to €24.10 on your card and charge what your bag weighs',
    );
  });

  it('shows the final bill once captured: the real line price, the grams and the released hold', () => {
    renderWithProviders(
      <OrderSummary
        items={[{ ...weighedItem, weighedGrams: 940, finalCents: 355, lineTotalCents: 378 }]}
        totals={order.totals}
        authorizedCents={2410}
        capturedCents={2100}
      />,
    );
    expect(screen.queryByTestId('order-held')).not.toBeInTheDocument();
    expect(screen.getByTestId('order-item-weighed')).toHaveTextContent('Weighed: 940 g');
    expect(screen.getByTestId('order-item')).toHaveTextContent('€3.55');
    expect(screen.getByTestId('order-final-bill')).toHaveTextContent(
      'Final bill: €21.00 charged to your card. We had held €24.10; the rest is released.',
    );
    expect(screen.getByTestId('order-total')).toHaveTextContent('€21.00');
  });

  it('keeps it short when the whole hold was charged', () => {
    renderWithProviders(
      <OrderSummary
        items={order.items}
        totals={order.totals}
        authorizedCents={4297}
        capturedCents={4297}
      />,
    );
    expect(screen.getByTestId('order-final-bill')).toHaveTextContent(
      /^Final bill: €42\.97 charged to your card\.$/,
    );
  });
});
