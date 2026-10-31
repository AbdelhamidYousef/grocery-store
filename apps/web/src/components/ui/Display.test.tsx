import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './Badge';
import { Price } from './Price';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';
import { VisuallyHidden } from './VisuallyHidden';

describe('Price', () => {
  it('formats integer cents', () => {
    render(<Price cents={1999} />);
    expect(screen.getByTestId('price-current')).toHaveTextContent('$19.99');
  });

  it('shows a range when variants differ', () => {
    render(<Price cents={1000} maxCents={2550} />);
    expect(screen.getByTestId('price-current')).toHaveTextContent('$10.00 - $25.50');
  });

  it('strikes through a higher compare-at price and announces it', () => {
    render(<Price cents={1500} compareAtCents={2000} />);
    expect(screen.getByTestId('price-compare')).toHaveTextContent('Original price $20.00');
  });

  it('ignores a compare-at price that is not higher', () => {
    render(<Price cents={1500} compareAtCents={1500} />);
    expect(screen.queryByTestId('price-compare')).not.toBeInTheDocument();
  });
});

describe('Spinner', () => {
  it('is a status with a spoken label', () => {
    render(<Spinner label="Loading products" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
  });

  it('is silent when the label is null', () => {
    render(<Spinner label={null} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    render(<Skeleton />);
    expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Badge and VisuallyHidden', () => {
  it('renders its text', () => {
    render(<Badge tone="danger">Sold out</Badge>);
    expect(screen.getByText('Sold out')).toBeInTheDocument();
  });

  it('keeps hidden text in the accessibility tree', () => {
    render(<VisuallyHidden>Skip</VisuallyHidden>);
    expect(screen.getByText('Skip')).toHaveClass('sr-only');
  });
});
