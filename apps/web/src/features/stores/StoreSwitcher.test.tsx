import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STORE_COOKIE } from '../../lib/store-cookie';
import * as trackModule from '../../lib/track';
import { renderApp } from '../../test/render';

import { StoreLayout } from './StoreContext';
import { StoreSwitcher } from './StoreSwitcher';

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = `${STORE_COOKIE}=; Max-Age=0; Path=/`;
});

function setup(path: string) {
  const go = vi.fn();
  renderApp(path, [
    {
      element: <StoreLayout />,
      children: [{ path: '*', element: <StoreSwitcher onNavigate={go} /> }],
    },
  ]);
  return go;
}

describe('StoreSwitcher', () => {
  it('lists every store view and shows the current one', () => {
    setup('/de-de/c/dogs');
    const select = screen.getByTestId('store-switcher');
    expect(select).toHaveValue('de-de');
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual([
      'eu-en',
      'de-de',
      'fr-fr',
      'uk-en',
    ]);
  });

  it('swaps the prefix keeping path and query, remembers the pick and tracks it', async () => {
    const track = vi.spyOn(trackModule, 'track');
    const go = setup('/de-de/products/rope-tug?v=2#faq');
    await userEvent.selectOptions(screen.getByTestId('store-switcher'), 'uk-en');
    expect(go).toHaveBeenCalledWith('/uk-en/products/rope-tug?v=2#faq');
    expect(document.cookie).toContain(`${STORE_COOKIE}=uk-en`);
    expect(track).toHaveBeenCalledWith({ name: 'store_switched', from: 'de-de', to: 'uk-en' });
  });
});
