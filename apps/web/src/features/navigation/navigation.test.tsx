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
const dairyButton = () => bar().findByRole('button', { name: /Dairy & eggs/ });

describe('mega-menu', () => {
  it('shows a disclosure button per department, closed by default', async () => {
    serve();
    renderApp('/');
    const dairy = await dairyButton();
    expect(dairy).toHaveAttribute('aria-expanded', 'false');
    expect(await bar().findByRole('button', { name: /Bakery/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
  });

  it('opens on click with categories, brands and the promo, and one panel at a time', async () => {
    serve();
    renderApp('/');
    await userEvent.click(await dairyButton());
    const panel = screen.getByTestId('menu-panel');
    expect(within(panel).getByRole('link', { name: /Cheese/ })).toHaveAttribute(
      'href',
      '/c/cheese',
    );
    expect(within(panel).getByRole('link', { name: 'Meadowbrook Dairy' })).toHaveAttribute(
      'href',
      '/brands/meadowbrook',
    );
    const promo = within(panel).getByTestId('menu-promo');
    expect(promo).toHaveAttribute('href', '/brands/meadowbrook');
    expect(within(promo).getByRole('img')).toHaveAttribute('alt', 'A milk bottle');
    expect(within(panel).getByRole('link', { name: 'All Dairy & eggs' })).toHaveAttribute(
      'href',
      '/c/dairy-eggs',
    );

    await userEvent.click(await bar().findByRole('button', { name: /Bakery/ }));
    expect(screen.getAllByTestId('menu-panel')).toHaveLength(1);
    expect(await dairyButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles with Enter and Space, and Escape closes it and returns focus to the button', async () => {
    serve();
    renderApp('/');
    const dairy = await dairyButton();
    dairy.focus();
    await userEvent.keyboard('{Enter}');
    expect(dairy).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Enter}');
    expect(dairy).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard(' ');
    expect(dairy).toHaveAttribute('aria-expanded', 'true');

    // Tab walks into the panel (it follows the button), and Escape from there still closes it.
    await userEvent.tab();
    expect(within(screen.getByTestId('menu-panel')).getAllByRole('link')[0]).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(dairy).toHaveAttribute('aria-expanded', 'false');
    expect(dairy).toHaveFocus();
  });

  it('opens on hover after a short pause and closes after leaving', async () => {
    serve();
    renderApp('/');
    const dairy = await dairyButton();
    await userEvent.hover(dairy);
    // Not instantly: the intent delay keeps a crossing mouse from flashing every panel.
    expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
    await waitFor(() => expect(dairy).toHaveAttribute('aria-expanded', 'true'));
    await userEvent.unhover(dairy);
    await waitFor(() => expect(dairy).toHaveAttribute('aria-expanded', 'false'));
  });

  it('closes when focus leaves it and when the page is pressed elsewhere', async () => {
    serve();
    renderApp('/');
    const dairy = await dairyButton();
    await userEvent.click(dairy);
    await userEvent.click(screen.getByTestId('main'));
    expect(dairy).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(dairy);
    const bakery = await bar().findByRole('button', { name: /Bakery/ });
    bakery.focus();
    await waitFor(() => expect(dairy).toHaveAttribute('aria-expanded', 'false'));
  });

  it('follows a link in the panel and closes', async () => {
    serve();
    const router = renderApp('/');
    await userEvent.click(await dairyButton());
    await userEvent.click(
      within(screen.getByTestId('menu-panel')).getByRole('link', { name: /Cheese/ }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/cheese'));
    expect(screen.queryByTestId('menu-panel')).not.toBeInTheDocument();
  });

  it('caps a long category list and offers "See all"', async () => {
    const many = Array.from({ length: MAX_MENU_CATEGORIES + 4 }, (_, i) => ({
      slug: `c${i}`,
      name: `Category ${i}`,
      productCount: i,
    }));
    const nav = makeNavigation();
    serve({
      departments: nav.departments.map((d) =>
        d.slug === 'dairy-eggs' ? { ...d, categories: many } : d,
      ),
    });
    renderApp('/');
    await userEvent.click(await dairyButton());
    const panel = screen.getByTestId('menu-panel');
    expect(within(panel).getAllByRole('link', { name: /^Category/ })).toHaveLength(
      MAX_MENU_CATEGORIES,
    );
    expect(within(panel).getByTestId('menu-see-all')).toHaveTextContent('See all Dairy & eggs');
  });

  it('shows no promo tile for a department without one', async () => {
    const nav = makeNavigation();
    serve({ departments: nav.departments.map((d) => ({ ...d, promo: null })) });
    renderApp('/');
    await userEvent.click(await dairyButton());
    expect(screen.queryByTestId('menu-promo')).not.toBeInTheDocument();
  });

  it('falls back to plain links to each department page while loading or when the call fails', async () => {
    server.use(
      http.get(`${API}/navigation`, () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
      ),
    );
    renderApp('/');
    expect(await bar().findByRole('link', { name: 'Dairy & eggs' })).toHaveAttribute(
      'href',
      '/c/dairy-eggs',
    );
    expect(bar().queryByRole('button', { name: /Dairy & eggs/ })).not.toBeInTheDocument();
  });
});

describe('mobile menu', () => {
  it('is an accordion inside the drawer: one department open at a time, links close the drawer', async () => {
    serve();
    const router = renderApp('/');
    await userEvent.click(await screen.findByTestId('mobile-nav-button'));
    const drawer = within(screen.getByTestId('mobile-nav'));
    const dairy = await drawer.findByRole('button', { name: /Dairy & eggs/ });
    expect(dairy).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(dairy);
    expect(dairy).toHaveAttribute('aria-expanded', 'true');
    expect(drawer.getByRole('link', { name: 'Milk & cream' })).toBeInTheDocument();
    await userEvent.click(drawer.getByRole('button', { name: /Bakery/ }));
    expect(dairy).toHaveAttribute('aria-expanded', 'false');
    expect(drawer.queryByRole('link', { name: 'Milk & cream' })).not.toBeInTheDocument();
    await userEvent.click(drawer.getByRole('link', { name: 'Bread' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/bread'));
  });
});
