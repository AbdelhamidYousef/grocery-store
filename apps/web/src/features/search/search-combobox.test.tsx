import type { Suggestions } from '@store/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

import { addRecentSearch, getRecentSearches, resetRecentSearches } from './recent-searches';

afterEach(resetRecentSearches);

const SUGGESTIONS: Suggestions = {
  products: [
    {
      name: 'Chew Stick',
      slug: 'chew-stick',
      imageUrl: '/products/chew.webp',
      imageAlt: '',
      priceFromCents: 699,
      currency: 'EUR',
    },
    {
      name: 'Chewy Bone',
      slug: 'chewy-bone',
      imageUrl: null,
      imageAlt: '',
      priceFromCents: 1299,
      currency: 'EUR',
    },
  ],
  categories: [{ slug: 'dog-chews', name: 'Dog Chews', parentName: 'Dairy & eggs' }],
  brands: [{ slug: 'chewco', name: 'ChewCo' }],
};

function suggestHandler(onCall?: (q: string) => void, data: Suggestions = SUGGESTIONS) {
  return http.get(`${API}/search/suggest`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    onCall?.(q);
    return HttpResponse.json({ data });
  });
}

const box = () =>
  within(screen.getByTestId('header')).getByRole('combobox', { name: 'Search products' });

describe('search combobox', () => {
  it('exposes the ARIA combobox contract and walks the options with the arrow keys', async () => {
    server.use(suggestHandler());
    renderApp('/');
    const input = box();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');

    await userEvent.type(input, 'chew');
    const list = await within(screen.getByTestId('header')).findByRole('listbox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', list.id);
    expect(
      within(list)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-labelledby')),
    ).toHaveLength(3);
    expect(within(list).getByRole('group', { name: 'Products' })).toBeInTheDocument();
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(4);

    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[2]!.id);
    await userEvent.keyboard('{End}');
    expect(input).toHaveAttribute('aria-activedescendant', options[3]!.id);
    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);
    await userEvent.keyboard('{Home}{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', options[3]!.id);
    // Focus never left the input.
    expect(input).toHaveFocus();
  });

  it('announces the counts in a polite live region', async () => {
    server.use(suggestHandler());
    renderApp('/');
    await userEvent.type(box(), 'chew');
    await waitFor(() =>
      expect(screen.getByTestId('search-status')).toHaveTextContent(
        '2 products, 1 category, 1 brand',
      ),
    );
    expect(screen.getByTestId('search-status')).toHaveAttribute('aria-live', 'polite');
  });

  it('opens the highlighted suggestion with Enter, and runs the plain search with none', async () => {
    server.use(suggestHandler());
    const router = renderApp('/');
    await userEvent.type(box(), 'chew');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/products/chew-stick'));

    await router.navigate('/');
    await userEvent.clear(box());
    await userEvent.type(box(), 'chew toy{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/search'));
    expect(router.state.location.search).toBe('?q=chew%20toy');
  });

  it('navigates to a category and a brand suggestion', async () => {
    server.use(suggestHandler());
    const router = renderApp('/');
    await userEvent.type(box(), 'chew');
    await userEvent.click(await screen.findByRole('option', { name: /Dog Chews/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dog-chews'));
  });

  it('closes on Escape, and clears the text on a second Escape', async () => {
    server.use(suggestHandler());
    renderApp('/');
    await userEvent.type(box(), 'chew');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box()).toHaveValue('chew');
    await userEvent.keyboard('{Escape}');
    expect(box()).toHaveValue('');
  });

  it('debounces: typing fast sends one request for the settled text', async () => {
    const asked: string[] = [];
    server.use(suggestHandler((q) => asked.push(q)));
    renderApp('/');
    await userEvent.type(box(), 'chewing', { delay: 20 });
    await screen.findByRole('listbox');
    expect(asked).toEqual(['chewing']);
  });

  it('does not ask for a single character and shows no stale results for new text', async () => {
    const asked: string[] = [];
    server.use(suggestHandler((q) => asked.push(q)));
    renderApp('/');
    await userEvent.type(box(), 'c');
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(asked).toEqual([]);
    await userEvent.type(box(), 'h');
    await screen.findByRole('listbox');
    await userEvent.type(box(), 'x');
    // Text moved on to "chx": the answer for "ch" is gone, nothing stale is listed.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('aborts the request of a term the shopper has typed past', async () => {
    let aborted = 0;
    server.use(
      http.get(`${API}/search/suggest`, async ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        request.signal.addEventListener('abort', () => (aborted += 1));
        if (q === 'ch') await new Promise((r) => setTimeout(r, 1500));
        return HttpResponse.json({ data: SUGGESTIONS });
      }),
    );
    renderApp('/');
    await userEvent.type(box(), 'ch');
    await act(() => new Promise((r) => setTimeout(r, 350)));
    await userEvent.type(box(), 'ew');
    await screen.findByRole('listbox');
    expect(aborted).toBeGreaterThan(0);
  });

  it('says so when there is nothing to suggest and still lets Enter search', async () => {
    server.use(suggestHandler(undefined, { products: [], categories: [], brands: [] }));
    const router = renderApp('/');
    await userEvent.type(box(), 'zzzz');
    await waitFor(() =>
      expect(screen.getByTestId('search-message')).toHaveTextContent('No suggestions'),
    );
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.search).toBe('?q=zzzz'));
  });

  it('falls back to the plain search when suggestions fail', async () => {
    server.use(
      http.get(`${API}/search/suggest`, () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
      ),
    );
    const router = renderApp('/');
    await userEvent.type(box(), 'rope{Enter}');
    await waitFor(() => expect(router.state.location.search).toBe('?q=rope'));
  });
});

describe('recent searches', () => {
  it('records a search, shows it on focus, and removes it with Delete', async () => {
    const router = renderApp('/');
    await userEvent.type(box(), 'rope{Enter}');
    await waitFor(() => expect(router.state.location.search).toBe('?q=rope'));
    expect(getRecentSearches()).toEqual(['rope']);

    await userEvent.clear(box());
    await userEvent.click(box());
    const option = await within(await screen.findByRole('listbox')).findByRole('option', {
      name: /rope/,
    });
    expect(screen.getByRole('group', { name: 'Recent searches' })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{Delete}');
    await waitFor(() => expect(getRecentSearches()).toEqual([]));
    expect(option).not.toBeInTheDocument();
  });

  it('keeps the newest six without duplicates and clears them all', async () => {
    for (const t of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'A1']) addRecentSearch(t);
    expect(getRecentSearches()).toEqual(['A1', 'g7', 'f6', 'e5', 'd4', 'c3']);
    renderApp('/');
    await userEvent.click(box());
    expect(await within(await screen.findByRole('listbox')).findAllByRole('option')).toHaveLength(
      6,
    );
    await userEvent.click(screen.getByTestId('recent-clear'));
    expect(getRecentSearches()).toEqual([]);
  });

  it('opens a recent search as a search page', async () => {
    addRecentSearch('rope toy');
    const router = renderApp('/');
    await userEvent.click(box());
    await userEvent.click(
      await within(await screen.findByRole('listbox')).findByRole('option', { name: /rope toy/ }),
    );
    await waitFor(() => expect(router.state.location.search).toBe('?q=rope%20toy'));
  });

  it('still works when storage throws', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const router = renderApp('/');
      await userEvent.type(box(), 'rope{Enter}');
      await waitFor(() => expect(router.state.location.search).toBe('?q=rope'));
      expect(getRecentSearches()).toEqual(['rope']);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('on a phone', () => {
  it('turns the focused box into a full-screen overlay with a Cancel button, and closes it again', async () => {
    // jsdom has no matchMedia at all, so the stand-in is defined (and removed again) by hand.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    try {
      server.use(suggestHandler());
      renderApp('/');
      await userEvent.click(box());
      expect(screen.getByTestId('search-combobox').className).toContain('fixed');
      expect(document.body.style.overflow).toBe('hidden');
      await userEvent.type(box(), 'chew');
      expect(await screen.findByRole('listbox')).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('search-cancel'));
      expect(screen.getByTestId('search-combobox').className).not.toContain('fixed');
      expect(document.body.style.overflow).not.toBe('hidden');
    } finally {
      Reflect.deleteProperty(window, 'matchMedia');
    }
  });
});
