import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

describe('newsletter sign-up', () => {
  it('needs the consent box, then sends email, pets and consent', async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post(`${API}/newsletter/subscribe`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ data: { status: 'check_your_inbox' } }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/newsletter');
    const form = await screen.findByTestId('newsletter-form');
    await user.type(form.querySelector('input[type="email"]')!, 'pat@example.com');
    await user.click(screen.getByLabelText('Dogs'));
    await user.click(screen.getByRole('button', { name: /subscribe/i }));
    expect(await screen.findByText('Please tick the box to subscribe')).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await user.click(screen.getByLabelText(/Send me Grocery news/));
    await user.click(screen.getByRole('button', { name: /subscribe/i }));
    expect(await screen.findByTestId('newsletter-done')).toHaveTextContent('confirmation link');
    expect(bodies[0]).toMatchObject({ email: 'pat@example.com', pets: ['dog'], consent: true });
  });
});

describe('newsletter links', () => {
  it('confirms once on arrival and says what happened', async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/newsletter/confirm`, () => {
        calls += 1;
        return HttpResponse.json({ data: { status: 'confirmed' } });
      }),
    );
    renderApp('/newsletter/confirm?token=' + 'a'.repeat(24));
    expect(await screen.findByText(/You are subscribed/)).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('says an expired link has expired and offers a fresh sign-up', async () => {
    server.use(
      http.post(`${API}/newsletter/confirm`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'expired', details: { expired: true } } },
          { status: 410 },
        ),
      ),
    );
    renderApp('/newsletter/confirm?token=' + 'a'.repeat(24));
    expect(await screen.findByText(/This link has expired/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up again' })).toBeInTheDocument();
  });

  it('unsubscribes with one visit', async () => {
    server.use(
      http.post(`${API}/newsletter/unsubscribe`, () =>
        HttpResponse.json({ data: { status: 'unsubscribed' } }),
      ),
    );
    renderApp('/newsletter/unsubscribe?token=' + 'b'.repeat(24));
    expect(await screen.findByText(/You are unsubscribed/)).toBeInTheDocument();
  });
});
