import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/render';

const box = () =>
  within(screen.getByTestId('header')).getByRole('combobox', { name: 'Search products' });

describe('search box', () => {
  it('navigates to /search?q= with the typed words encoded', async () => {
    const router = renderApp('/');
    await userEvent.type(box(), 'chew toy{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/search'));
    expect(router.state.location.search).toBe('?q=chew%20toy');
  });

  it('ignores an empty search', async () => {
    const router = renderApp('/');
    await userEvent.type(box(), '   {Enter}');
    expect(router.state.location.pathname).toBe('/');
  });

  it('keeps the query in the box on the search page and follows the url', async () => {
    const router = renderApp('/search?q=rope');
    expect(box()).toHaveValue('rope');
    await router.navigate('/search?q=ball');
    await waitFor(() => expect(box()).toHaveValue('ball'));
    await router.navigate('/c/dogs');
    await waitFor(() => expect(box()).toHaveValue(''));
  });

  it('puts focus on the results after searching from another page', async () => {
    renderApp('/');
    await userEvent.type(box(), 'rope{Enter}');
    await waitFor(() => expect(screen.getByTestId('main')).toHaveFocus());
  });
});
