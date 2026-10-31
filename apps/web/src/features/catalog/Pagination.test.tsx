import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Pagination, pageWindow } from './Pagination';

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  });
  it('collapses gaps around the current page', () => {
    expect(pageWindow(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, null, 20]);
  });
});

describe('Pagination', () => {
  const href = (p: number) => `?page=${p}`;
  it('marks the current page and links neighbours', () => {
    render(
      <MemoryRouter>
        <Pagination page={2} totalPages={5} hrefFor={href} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Prev/ })).toHaveAttribute('href', '/?page=1');
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/?page=3');
  });
  it('renders nothing for a single page', () => {
    const { container } = render(
      <MemoryRouter>
        <Pagination page={1} totalPages={1} hrefFor={href} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
