import { screen } from '@testing-library/react';
import { Link } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/render';

import { StoreLayout, useStore, useStorePath } from './StoreContext';

function Probe() {
  const store = useStore();
  const path = useStorePath();
  return (
    <div>
      <p data-testid="store">{`${store.code} ${store.currency}`}</p>
      <p data-testid="full">{path('/products/x')}</p>
      <Link to="/cart">cart</Link>
    </div>
  );
}

const table = [{ element: <StoreLayout />, children: [{ path: '*', element: <Probe /> }] }];

describe('StoreLayout', () => {
  it('provides the store from the URL prefix, builds full paths and prefixes links', () => {
    renderApp('/de-de/anything', table);
    expect(screen.getByTestId('store')).toHaveTextContent('de-de EUR');
    expect(screen.getByTestId('full')).toHaveTextContent('/de-de/products/x');
    expect(screen.getByRole('link', { name: 'cart' })).toHaveAttribute('href', '/de-de/cart');
    expect(document.documentElement.lang).toBe('de-DE');
  });

  it('falls back to the default store with no prefix', () => {
    renderApp('/anything', table);
    expect(screen.getByTestId('store')).toHaveTextContent('de-en EUR');
    expect(screen.getByTestId('full')).toHaveTextContent('/products/x');
    expect(screen.getByRole('link', { name: 'cart' })).toHaveAttribute('href', '/cart');
  });
});

describe('the app under a store prefix', () => {
  it('renders a page and keeps every header link inside the store', async () => {
    renderApp('/de-en/cart');
    expect(await screen.findByRole('heading', { level: 1, name: 'Your cart' })).toBeInTheDocument();
    expect(screen.getByTestId('logo')).toHaveAttribute('href', '/de-en');
    expect(document.documentElement.lang).toBe('en-DE');
  });

  it('shows the not-found page for an unknown store code', async () => {
    renderApp('/xx-yy/cart');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/can't find that/i);
  });
});
