import type { Navigation } from '@store/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeNavigation } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

import { MAX_MENU_CATEGORIES } from './MegaMenu';

function serve(nav: Navigation = makeNavigation()) {
  server.use(http.get(`${API}/navigation`, () => HttpResponse.json({ data: nav })));
}
const bar = () => within(screen.getByTestId('main-nav'));
const dogsButton = () => bar().findByRole('button', { name: /Dogs/ });

describe('mega-menu', () => {
  it('shows a disclosure button per pet, closed by default', async () => {
    serve();
    renderApp('/');
    const dogs = await dogsButton();
    expect(dogs).toHaveAttribute('aria-expanded', 'false');
    expect(await bar().findByRole('button', { name: /Cats/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
  });

  it('opens on click with categories, brands and the promo, and one panel at a time', async () => {
    serve();
    renderApp('/');
    await userEvent.click(await dogsButton());
    const panel = screen.getByTestId('menu-panel');
    expect(within(panel).getByRole('link', { name: /Toys/ })).toHaveAttribute(
      'href',
      '/c/dog-toys',
    );
    expect(within(panel).getByRole('link', { name: 'Burrow & Biscuit' })).toHaveAttribute(
      'href',
      '/brands/burrow-and-biscuit',
    );
    const promo = within(panel).getByTestId('menu-promo');
    expect(promo).toHaveAttribute('href', '/c/dog-walk');
    expect(within(promo).getByRole('img')).toHaveAttribute('alt', 'A lead');
    expect(within(panel).getByRole('link', { name: 'All Dogs' })).toHaveAttribute(
      'href',
      '/c/dogs',
    );

    await userEvent.click(await bar().findByRole('button', { name: /Cats/ }));
    expect(screen.getAllByTestId('menu-panel')).toHaveLength(1);
    expect(await dogsButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles with Enter and Space, and Escape closes it and returns focus to the button', async () => {
    serve();
    renderApp('/');
    const dogs = await dogsButton();
    dogs.focus();
    await userEvent.keyboard('{Enter}');
    expect(dogs).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Enter}');
    expect(dogs).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard(' ');
    expect(dogs).toHaveAttribute('aria-expanded', 'true');

    // Tab walks into the panel (it follows the button), and Escape from there still closes it.
    await userEvent.tab();
    expect(within(screen.getByTestId('menu-panel')).getAllByRole('link')[0]).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(dogs).toHaveAttribute('aria-expanded', 'false');
    expect(dogs).toHaveFocus();
  });

  it('opens on hover after a short pause and closes after leaving', async () => {
    serve();
    renderApp('/');
    const dogs = await dogsButton();
    await userEvent.hover(dogs);
    // Not instantly: the intent delay keeps a crossing mouse from flashing every panel.
    expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
    await waitFor(() => expect(dogs).toHaveAttribute('aria-expanded', 'true'));
    await userEvent.unhover(dogs);
    await waitFor(() => expect(dogs).toHaveAttribute('aria-expanded', 'false'));
  });

  it('closes when focus leaves it and when the page is pressed elsewhere', async () => {
    serve();
    renderApp('/');
    const dogs = await dogsButton();
    await userEvent.click(dogs);
    await userEvent.click(screen.getByTestId('main'));
    expect(dogs).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(dogs);
    const cats = await bar().findByRole('button', { name: /Cats/ });
    cats.focus();
    await waitFor(() => expect(dogs).toHaveAttribute('aria-expanded', 'false'));
  });

  it('follows a link in the panel and closes', async () => {
    serve();
    const router = renderApp('/');
    await userEvent.click(await dogsButton());
    await userEvent.click(
      within(screen.getByTestId('menu-panel')).getByRole('link', { name: /Toys/ }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dog-toys'));
    expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
  });

  it('caps a long category list and offers "See all"', async () => {
    const many = Array.from({ length: MAX_MENU_CATEGORIES + 4 }, (_, i) => ({
      slug: `c${i}`,
      name: `Category ${i}`,
      productCount: i,
    }));
    const nav = makeNavigation();
    serve({ pets: nav.pets.map((p) => (p.pet === 'dog' ? { ...p, categories: many } : p)) });
    renderApp('/');
    await userEvent.click(await dogsButton());
    const panel = screen.getByTestId('menu-panel');
    expect(within(panel).getAllByRole('link', { name: /^Category/ })).toHaveLength(
      MAX_MENU_CATEGORIES,
    );
    expect(within(panel).getByTestId('menu-see-all')).toHaveTextContent('See all Dogs');
  });

  it('shows no promo tile for a pet without one', async () => {
    const nav = makeNavigation();
    serve({ pets: nav.pets.map((p) => ({ ...p, promo: null })) });
    renderApp('/');
    await userEvent.click(await dogsButton());
    expect(screen.queryByTestId('menu-promo')).not.toBeInTheDocument();
  });

  it('falls back to plain links to each pet page while loading or when the call fails', async () => {
    server.use(
      http.get(`${API}/navigation`, () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
      ),
    );
    renderApp('/');
    expect(await bar().findByRole('link', { name: 'Dogs' })).toHaveAttribute('href', '/c/dogs');
    expect(bar().queryByRole('button', { name: /Dogs/ })).not.toBeInTheDocument();
  });
});

describe('mobile menu', () => {
  it('is an accordion inside the drawer: one pet open at a time, links close the drawer', async () => {
    serve();
    const router = renderApp('/');
    await userEvent.click(await screen.findByTestId('mobile-nav-button'));
    const drawer = within(screen.getByTestId('mobile-nav'));
    const dogs = await drawer.findByRole('button', { name: /Dogs/ });
    expect(dogs).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(dogs);
    expect(dogs).toHaveAttribute('aria-expanded', 'true');
    expect(drawer.getByRole('link', { name: 'Beds & Housing' })).toBeInTheDocument();
    await userEvent.click(drawer.getByRole('button', { name: /Cats/ }));
    expect(dogs).toHaveAttribute('aria-expanded', 'false');
    expect(drawer.queryByRole('link', { name: 'Beds & Housing' })).not.toBeInTheDocument();
    await userEvent.click(drawer.getByRole('link', { name: 'Scratch posts' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/cat-scratch'));
  });
});
