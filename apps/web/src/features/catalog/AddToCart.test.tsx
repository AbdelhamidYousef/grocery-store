import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { makeVariant } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';

import { AddToCart, MAX_QUANTITY } from './AddToCart';

describe('AddToCart', () => {
  it('keeps the quantity between 1 and the maximum', async () => {
    render(<AddToCart variant={makeVariant()} />);
    const box = screen.getByRole('spinbutton', { name: 'Quantity' });
    const minus = screen.getByRole('button', { name: 'Decrease quantity' });
    const plus = screen.getByRole('button', { name: 'Increase quantity' });
    expect(box).toHaveValue(1);
    expect(minus).toBeDisabled();
    await userEvent.click(plus);
    expect(box).toHaveValue(2);
    await userEvent.clear(box);
    await userEvent.type(box, '99');
    expect(box).toHaveValue(MAX_QUANTITY);
    expect(plus).toBeDisabled();
  });

  it('shows a disabled add-to-cart with a reason when no handler is wired', () => {
    render(<AddToCart variant={makeVariant()} />);
    const button = screen.getByRole('button', { name: 'Add to cart' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/not available here/);
  });

  it('calls onAdd with the quantity once wired', async () => {
    const onAdd = vi.fn();
    render(<AddToCart variant={makeVariant()} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(onAdd).toHaveBeenCalledWith(2);
  });

  it('shows the low-stock hint only for a purchasable low-stock variant', () => {
    const { rerender } = render(<AddToCart variant={makeVariant({ lowStock: true })} />);
    expect(screen.getByText('Only a few left')).toBeInTheDocument();
    rerender(<AddToCart variant={makeVariant({ lowStock: false })} />);
    expect(screen.queryByText('Only a few left')).not.toBeInTheDocument();
  });

  it('disables the stepper and says sold out for an unavailable variant', () => {
    renderWithProviders(<AddToCart variant={makeVariant({ available: false, lowStock: true })} />);
    expect(screen.getByRole('button', { name: 'Sold out' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toBeDisabled();
    expect(screen.queryByText('Only a few left')).not.toBeInTheDocument();
  });
});
