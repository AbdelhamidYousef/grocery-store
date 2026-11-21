import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeOrder } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';

import { OrderSummary } from './OrderSummary';

// The order screens show the bill lines the server stored: goods, deposit, bags, delivery.
describe('order summary bill lines (G9)', () => {
  const order = makeOrder();
  const totals = {
    ...order.totals,
    subtotalCents: 3600,
    depositCents: 225,
    bagFeeCents: 50,
    shippingCents: 299,
    deliveryFeeCents: 299,
    totalCents: 3600 + 225 + 50 + 299,
  };

  it('lists the deposit and the bags as their own lines with the delivery fee', () => {
    renderWithProviders(<OrderSummary items={order.items} totals={totals} />);
    const summary = within(screen.getByTestId('order-summary'));
    expect(summary.getByText('Bottle deposit').nextElementSibling).toHaveTextContent('€2.25');
    expect(summary.getByText('Paper bags').nextElementSibling).toHaveTextContent('€0.50');
    expect(summary.getByText('Delivery').nextElementSibling).toHaveTextContent('€2.99');
    expect(screen.getByTestId('order-total')).toHaveTextContent('€41.74');
  });

  it('shows no deposit or bag line when there is none, and "Free" for free delivery', () => {
    renderWithProviders(
      <OrderSummary
        items={order.items}
        totals={{
          ...totals,
          depositCents: 0,
          bagFeeCents: 0,
          shippingCents: 0,
          totalCents: 3600,
        }}
      />,
    );
    const summary = within(screen.getByTestId('order-summary'));
    expect(summary.queryByText('Bottle deposit')).not.toBeInTheDocument();
    expect(summary.queryByText('Paper bags')).not.toBeInTheDocument();
    expect(summary.getByText('Delivery').nextElementSibling).toHaveTextContent('Free');
  });
});
