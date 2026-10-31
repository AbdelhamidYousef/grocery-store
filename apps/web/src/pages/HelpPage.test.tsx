import { HIGHLIGHT_END, HIGHLIGHT_START, type HelpHit } from '@store/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { renderApp } from '../test/render';
import { API, server } from '../test/server';

const hit = (over: Partial<HelpHit> = {}): HelpHit => ({
  slug: 'shipping-cost',
  topic: 'shipping',
  question: 'How much is shipping?',
  answerMd: 'Standard is **4.90 EUR**.',
  snippet: null,
  ...over,
});

describe('help centre', () => {
  it('lists articles as an accordion that opens and closes with aria-expanded', async () => {
    server.use(http.get(`${API}/help`, () => HttpResponse.json({ data: [hit()] })));
    const user = userEvent.setup();
    renderApp('/help');
    const button = await screen.findByRole('button', { name: /How much is shipping/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(panel).toHaveAttribute('hidden');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('hidden');
    expect(within(panel as HTMLElement).getByText('4.90 EUR').tagName).toBe('STRONG');
  });

  it('searches after a pause, keeps the query in the URL and highlights the match', async () => {
    const seen = vi.fn();
    server.use(
      http.get(`${API}/help`, ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        seen(q);
        return HttpResponse.json({
          data: q
            ? [hit({ snippet: `Standard ${HIGHLIGHT_START}delivery${HIGHLIGHT_END} is fast.` })]
            : [],
        });
      }),
    );
    const user = userEvent.setup();
    const router = renderApp('/help');
    await user.type(await screen.findByLabelText('Search the help centre'), 'delivery');
    await waitFor(() => expect(router.state.location.search).toBe('?q=delivery'));
    const mark = await screen.findByText('delivery', { selector: 'mark' });
    expect(mark).toBeInTheDocument();
    // One request per settled query, not one per keystroke.
    expect(seen.mock.calls.filter(([q]) => q !== null).length).toBeLessThanOrEqual(2);
  });

  it('reads the query and topic from the URL', async () => {
    const seen = vi.fn();
    server.use(
      http.get(`${API}/help`, ({ request }) => {
        seen(Object.fromEntries(new URL(request.url).searchParams));
        return HttpResponse.json({ data: [hit()] });
      }),
    );
    renderApp('/help?q=ship&topic=returns');
    await screen.findByTestId('help-list');
    expect(seen).toHaveBeenCalledWith({ q: 'ship', topic: 'returns' });
    expect(screen.getByLabelText('Search the help centre')).toHaveValue('ship');
  });

  it('shows a helpful empty state when nothing matches', async () => {
    server.use(http.get(`${API}/help`, () => HttpResponse.json({ data: [] })));
    renderApp('/help?q=zzz');
    expect(await screen.findByTestId('help-no-results')).toHaveTextContent(
      'Nothing found for "zzz"',
    );
  });
});
