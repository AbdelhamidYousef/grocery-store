import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeList } from '../test/fixtures';
import { renderApp } from '../test/render';
import { API, server } from '../test/server';

describe('search page', () => {
  it('searches with q and shows the results heading', async () => {
    let q = '';
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        q = new URL(request.url).searchParams.get('q') ?? '';
        return HttpResponse.json(makeList([]));
      }),
    );
    renderApp('/search?q=rope');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Results for "rope"' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('No results for "rope"')).toBeInTheDocument();
    expect(q).toBe('rope');
  });

  it('asks for a query instead of calling the api when there is none', () => {
    renderApp('/search');
    expect(screen.getByText(/Type what you are looking for/)).toBeInTheDocument();
  });
});
