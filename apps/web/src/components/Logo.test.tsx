import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Logo } from './Logo';

describe('Logo', () => {
  it('shows the word Grocery next to a decorative mark', () => {
    render(<Logo />);
    expect(screen.getByText('Grocery')).toBeInTheDocument();
    const mark = screen.getByTestId('logo-mark');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark.querySelectorAll('path, rect').length).toBeGreaterThan(2);
  });

  it('has a brighter bag on the dark footer', () => {
    const { container } = render(<Logo tone="light" />);
    expect(container.querySelector('rect')).toHaveAttribute('fill', 'var(--color-primary-bright)');
  });
});
