import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearHomeSlots, registerHomeSlot } from '../features/home/slots';
import * as tracking from '../lib/track';
import { makeCard, makeCategory, makeHome, makeList } from '../test/fixtures';
import { renderApp } from '../test/render';
import { server, API } from '../test/server';

const sections = () =>
  [...document.querySelectorAll('[data-home-section]')].map((n) =>
    n.getAttribute('data-home-section'),
  );

afterEach(() => {
  clearHomeSlots();
});

describe('home page', () => {
  it('shows the hero, department tiles with counts, bestsellers, guides and testimonials', async () => {
    const spy = vi.spyOn(tracking, 'track');
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Groceries at your door in 30 minutes',
    );
    expect(screen.getByTestId('home-hero')).toBeInTheDocument();

    const tiles = within(screen.getByTestId('department-tiles'));
    expect(tiles.getAllByRole('link')).toHaveLength(10);
    expect(await tiles.findByText('10 products')).toBeInTheDocument();

    const cards = await screen.findAllByTestId('product-card');
    expect(cards[0]).toHaveAttribute('href', '/products/rope-tug');
    expect(await screen.findByTestId('guides-teaser')).toBeInTheDocument();
    expect(await screen.findByTestId('rating-summary')).toHaveTextContent('4.8 out of 5');
    expect(spy).toHaveBeenCalledWith({ name: 'view_home' });
  });

  it('counts a department whose category slug is translated (German store)', async () => {
    server.use(
      http.get(`${API}/categories`, () =>
        HttpResponse.json({
          data: [
            makeCategory({ slug: 'milch-eier', departmentSlug: 'dairy-eggs', productCount: 7 }),
          ],
        }),
      ),
    );
    renderApp('/');
    const dairy = await screen.findByText('7 products');
    expect(dairy.closest('[data-dept]')).toHaveAttribute('data-dept', 'dairy-eggs');
  });

  it('shows the admin hero slides as offer cards', async () => {
    renderApp('/');
    const offers = within(await screen.findByTestId('featured-offers'));
    expect(offers.getAllByRole('listitem')).toHaveLength(3);
    expect(offers.getByRole('link', { name: 'Shop bakery' })).toHaveAttribute('href', '/c/bakery');
  });

  it('shows deals from the products that carry the Sale badge, and the food bank teaser', async () => {
    let seen = '';
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json(makeList([makeCard({ name: 'Cheap milk' })]));
      }),
    );
    renderApp('/');
    const deals = within(await screen.findByTestId('deals'));
    expect(deals.getByRole('heading', { name: 'Deals this week' })).toBeInTheDocument();
    expect(await deals.findByText('Cheap milk')).toBeInTheDocument();
    expect(new URLSearchParams(seen).get('badge')).toBe('sale');
    const teaser = await screen.findByTestId('food-bank-teaser');
    expect(teaser).toHaveTextContent('Spreeufer Food Bank');
    expect(within(teaser).getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '/charity',
    );
  });

  it('hides the deals section when nothing is on sale', async () => {
    server.use(http.get(`${API}/products`, () => HttpResponse.json(makeList([]))));
    renderApp('/');
    await screen.findByTestId('guides-teaser');
    expect(screen.queryByTestId('deals')).not.toBeInTheDocument();
  });

  it('keeps the "Your usuals" placeholder hidden until it is switched on', async () => {
    renderApp('/');
    await screen.findByTestId('guides-teaser');
    expect(screen.queryByTestId('usuals')).not.toBeInTheDocument();
  });

  it('checks the postcode shape, then links to ?postcode= and nothing more', async () => {
    const user = userEvent.setup();
    const router = renderApp('/');
    const box = within(screen.getByTestId('postcode-form'));
    await user.type(box.getByLabelText('Your postcode'), '1011');
    await user.click(box.getByRole('button', { name: 'Check delivery' }));
    expect(await box.findByText('Enter a 5-digit postcode')).toBeInTheDocument();
    expect(router.state.location.search).toBe('');

    await user.type(box.getByLabelText('Your postcode'), '5');
    await user.click(box.getByRole('button', { name: 'Check delivery' }));
    await waitFor(() => expect(router.state.location.search).toBe('?postcode=10115'));
    expect(await screen.findByTestId('postcode-saved')).toHaveTextContent('10115');
  });

  it('prefills the postcode box from the url', () => {
    renderApp('/?postcode=12043');
    expect(screen.getByLabelText('Your postcode')).toHaveValue('12043');
  });

  it('shows the promo tile only when the API sends one', async () => {
    server.use(
      http.get(`${API}/home`, () =>
        HttpResponse.json({
          data: makeHome({
            promoTile: {
              enabled: true,
              text: 'Free delivery!',
              linkLabel: 'Details',
              linkHref: '/help',
            },
          }),
        }),
      ),
    );
    renderApp('/');
    expect(await screen.findByTestId('promo-tile')).toHaveTextContent('Free delivery!');
  });

  it('leaves no empty block for missing optional sections', async () => {
    renderApp('/');
    await screen.findByTestId('featured-offers');
    await screen.findByTestId('guides-teaser');
    await screen.findByTestId('rating-summary');
    await screen.findByTestId('food-bank-teaser');
    await screen.findByTestId('deals');
    // No promo, no registered slots (the seasonal one is cleared here): their wrappers are empty
    // and hidden by `empty:hidden`, and nothing else is empty.
    const empty = [...document.querySelectorAll('[data-home-section]')].filter(
      (n) => n.childNodes.length === 0,
    );
    expect(empty.map((n) => n.getAttribute('data-home-section'))).toEqual(['promo']);
    expect(empty[0]).toHaveClass('empty:hidden');
  });

  it('renders registered slots in the fixed order: seasonal before the deals, usuals after the bestsellers, the rest last', async () => {
    registerHomeSlot({ id: 'newsletter', render: () => createElement('p', null, 'News') });
    registerHomeSlot({ id: 'seasonal', render: () => createElement('p', null, 'Season') });
    registerHomeSlot({ id: 'usuals', render: () => createElement('p', null, 'Usuals') });
    renderApp('/');
    await screen.findByTestId('featured-offers');
    expect(sections()).toEqual([
      'departments',
      'seasonal',
      'featured',
      'deals',
      'bestsellers',
      'usuals',
      'promo',
      'guides',
      'testimonials',
      'food-bank',
      'newsletter',
    ]);
  });

  it('keeps the page usable when the home data fails to load', async () => {
    server.use(http.get(`${API}/home`, () => HttpResponse.json({}, { status: 500 })));
    renderApp('/');
    expect(await within(screen.getByRole('main')).findByRole('alert')).toHaveTextContent(
      'could not load our bestsellers',
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
