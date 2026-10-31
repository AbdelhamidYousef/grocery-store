import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeCart, makeCartItem } from '../../test/fixtures';

import { CheckoutSummary } from './CheckoutSummary';

const lines = (n: number) =>
  Array.from({ length: n }, (_, i) => makeCartItem({ id: `l${i}`, variantId: `v${i}` }));

describe('<CheckoutSummary /> with many lines', () => {
  it('lists a few lines in the page itself', () => {
    render(<CheckoutSummary cart={makeCart(lines(3))} quote={null} placed={null} />);
    expect(screen.getAllByTestId('order-item')).toHaveLength(3);
    expect(screen.queryByTestId('checkout-summary-lines')).not.toBeInTheDocument();
  });

  it('puts 20 lines in a labelled, keyboard-focusable scroll box so the totals stay close', () => {
    render(<CheckoutSummary cart={makeCart(lines(20))} quote={null} placed={null} />);
    const box = screen.getByRole('region', { name: /Items in your order \(20\)/ });
    expect(box).toHaveAttribute('tabindex', '0');
    expect(box).toHaveClass('overflow-y-auto');
    expect(screen.getAllByTestId('order-item')).toHaveLength(20);
    expect(screen.getByTestId('order-total')).toBeInTheDocument();
  });
});
