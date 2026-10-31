import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { renderApp } from '../test/render';
import { API, server } from '../test/server';

describe('contact page', () => {
  it('has a labelled field for everything and a hidden honeypot', async () => {
    renderApp('/contact');
    for (const label of [
      'Your name',
      'Email',
      'What is it about?',
      'Order number (optional)',
      'Your message',
    ]) {
      expect(await screen.findByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId('contact-honeypot').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByTestId('contact-honeypot')).toHaveAttribute('tabindex', '-1');
  });

  it('shows field errors, moves focus to the first one, and sends nothing', async () => {
    const seen = vi.fn();
    server.use(http.post(`${API}/contact`, () => (seen(), HttpResponse.json({}, { status: 500 }))));
    const user = userEvent.setup();
    renderApp('/contact');
    await user.click(await screen.findByRole('button', { name: 'Send message' }));
    expect(await screen.findByLabelText('Your name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Your name')).toHaveFocus();
    expect(screen.getByLabelText('Your message')).toHaveAccessibleDescription(/at least 10/);
    expect(seen).not.toHaveBeenCalled();
  });

  it('sends the message and shows the reference', async () => {
    const seen = vi.fn();
    server.use(
      http.post(`${API}/contact`, async ({ request }) => {
        seen(await request.json());
        return HttpResponse.json({ data: { reference: 'MSG-ABCD1234' } }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/contact');
    await user.type(await screen.findByLabelText('Your name'), 'Ada');
    await user.type(screen.getByLabelText('Email'), 'ada@pawsome.test');
    await user.selectOptions(screen.getByLabelText('What is it about?'), 'order');
    await user.type(screen.getByLabelText('Your message'), 'Where is my parcel please?');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByTestId('contact-success')).toHaveTextContent('MSG-ABCD1234');
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ada', topic: 'order', email: 'ada@pawsome.test' }),
    );
  });

  it('explains a rate limit', async () => {
    server.use(
      http.post(`${API}/contact`, () =>
        HttpResponse.json({ error: { code: 'RATE_LIMITED', message: 'x' } }, { status: 429 }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/contact');
    await user.type(await screen.findByLabelText('Your name'), 'Ada');
    await user.type(screen.getByLabelText('Email'), 'ada@pawsome.test');
    await user.selectOptions(screen.getByLabelText('What is it about?'), 'other');
    await user.type(screen.getByLabelText('Your message'), 'Hello there, a question.');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('several messages');
  });
});
